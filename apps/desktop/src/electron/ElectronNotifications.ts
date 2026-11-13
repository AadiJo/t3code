import { BrowserWindow, Notification, app } from "electron";
import {
  DesktopNotification,
  DesktopNotificationCommand,
  DesktopNotificationSnapshot,
  desktopNotificationTitles,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Option from "effect/Option";
import * as DateTime from "effect/DateTime";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { DesktopEnvironment } from "../app/DesktopEnvironment.ts";
import { ElectronWindow } from "./ElectronWindow.ts";
import { DesktopIpc, makeIpcMethod, type DesktopIpcInvokeEvent } from "../ipc/DesktopIpc.ts";
import * as Channels from "../ipc/channels.ts";
import {
  NotificationState,
  emptyNotificationState,
  readNotifications,
  reconcileNotifications,
} from "../notifications/model.ts";

const escapeXml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]!,
  );

/** A Windows toast whose activation arguments carry the inbox item id. */
function windowsToastXml(input: { id: string; title: string; lines: readonly string[] }) {
  const text = [input.title, ...input.lines]
    .map((line) => `<text>${escapeXml(line)}</text>`)
    .join("");
  return `<toast launch="${escapeXml(input.id)}" activationType="foreground"><visual><binding template="ToastGeneric">${text}</binding></visual><audio silent="true"/></toast>`;
}

/**
 * Owns saved unread state and native notifications for this desktop installation. macOS shows
 * the unread count on the Dock here; on Windows the renderer draws it as a taskbar overlay.
 */
export const installElectronNotifications = Effect.fn("desktop.notifications.install")(
  function* () {
    const ipc = yield* DesktopIpc;
    const windows = yield* ElectronWindow;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const environment = yield* DesktopEnvironment;
    const platform = yield* HostProcess.Platform;
    if (platform !== "darwin" && platform !== "win32") return;
    const mac = platform === "darwin";
    const runPromise = Effect.runPromiseWith(yield* Effect.context<never>());
    const lock = yield* Semaphore.make(1);
    const file = path.join(path.dirname(environment.clientSettingsPath), "notifications.json");
    const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(NotificationState));
    const encode = Schema.encodeEffect(Schema.fromJsonString(NotificationState));
    let state = yield* fs.readFileString(file).pipe(
      Effect.flatMap(decode),
      Effect.catchTags({
        PlatformError: (error) =>
          error.reason._tag === "NotFound"
            ? Effect.succeed(emptyNotificationState())
            : Effect.fail(error),
      }),
    );
    const native = new Map<string, Notification>();
    // Windows reports a toast click both on the live object and through activation.
    const opened = new Set<string>();
    let pendingOpen: DesktopNotification | null = null;
    const focused = () => BrowserWindow.getAllWindows().some((window) => window.isFocused());
    const send = Effect.fn("ElectronNotifications.send")(function* (
      channel: string,
      payload: unknown,
    ) {
      const window = yield* windows.currentMainOrFirst;
      if (Option.isSome(window) && !window.value.webContents.isDestroyed())
        window.value.webContents.send(channel, payload);
    });
    const authorized = Effect.fn("ElectronNotifications.authorized")(function* (
      event?: DesktopIpcInvokeEvent,
    ) {
      const window = yield* windows.currentMainOrFirst;
      return Option.isSome(window) && window.value.webContents.id === event?.sender.id;
    });

    const commit = Effect.fn("ElectronNotifications.commit")(function* (next: NotificationState) {
      if (next === state) return;
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.writeFileString(`${file}.tmp`, yield* encode(next));
      yield* fs.rename(`${file}.tmp`, file);
      const unreadIds = new Set(next.items.filter((item) => !item.read).map((item) => item.id));
      const removed = state.items.filter((item) => !unreadIds.has(item.id)).map((item) => item.id);
      if (mac && removed.length) Notification.remove(removed);
      for (const id of removed) {
        if (!mac) native.get(id)?.close();
        native.delete(id);
      }
      state = next;
      if (mac) app.setBadgeCount(unreadIds.size);
      yield* send(Channels.NOTIFICATIONS_CHANGED_CHANNEL, state.items);
    });
    const open = (id: string) => {
      if (opened.has(id)) return;
      opened.add(id);
      void runPromise(
        lock
          .withPermit(
            Effect.gen(function* () {
              const item = state.items.find((entry) => entry.id === id);
              if (!item) return;
              pendingOpen = item;
              yield* commit(readNotifications(state, { type: "read", ids: [id] }));
              const window = yield* windows.currentMainOrFirst;
              if (Option.isSome(window)) {
                if (window.value.isMinimized()) window.value.restore();
                window.value.show();
                window.value.focus();
                if (!window.value.webContents.isLoading()) {
                  yield* send(Channels.NOTIFICATION_OPEN_CHANNEL, item);
                  pendingOpen = null;
                }
              }
            }),
          )
          .pipe(
            Effect.catchCause((error) => Effect.logError("Could not open notification.", error)),
          ),
      );
    };
    const retain = (id: string, notification: Notification) => {
      native.set(id, notification);
      notification.on("click", () => open(id));
      // Dismissal does not acknowledge the underlying work.
      notification.on("failed", (_event, error) => {
        void runPromise(Effect.logError("Could not show notification.", error));
      });
    };
    if (!mac) {
      // Also covers toasts clicked in Action Center after a restart.
      Notification.handleActivation(({ arguments: id }) => {
        if (id.startsWith("t3-work-")) open(id);
      });
    } else {
      app.setBadgeCount(state.items.filter((item) => !item.read).length);
      const history = yield* Effect.promise(() => Notification.getHistory()).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Could not restore Notification Center history.", cause).pipe(
            Effect.as([] as Notification[]),
          ),
        ),
      );
      for (const notification of history) {
        if (!notification.id.startsWith("t3-work-")) continue;
        if (state.items.some((item) => item.id === notification.id && !item.read))
          retain(notification.id, notification);
        else Notification.remove(notification.id);
      }
    }
    yield* ipc.handle(
      makeIpcMethod({
        channel: Channels.GET_NOTIFICATIONS_CHANNEL,
        payload: Schema.Void,
        result: Schema.Array(DesktopNotification),
        handler: (_, event) =>
          lock.withPermit(
            Effect.gen(function* () {
              if (!(yield* authorized(event))) return [];
              if (pendingOpen) {
                yield* send(Channels.NOTIFICATION_OPEN_CHANNEL, pendingOpen);
                pendingOpen = null;
              }
              return state.items;
            }),
          ),
      }),
    );
    yield* ipc.handle(
      makeIpcMethod({
        channel: Channels.UPDATE_NOTIFICATIONS_CHANNEL,
        payload: DesktopNotificationCommand,
        result: Schema.Void,
        handler: (command, event) =>
          lock.withPermit(
            Effect.gen(function* () {
              if (!(yield* authorized(event))) return;
              yield* commit(readNotifications(state, command));
            }),
          ),
      }),
    );
    yield* ipc.handle(
      makeIpcMethod({
        channel: Channels.SYNC_NOTIFICATIONS_CHANNEL,
        payload: DesktopNotificationSnapshot,
        result: Schema.Void,
        handler: (snapshot, event) =>
          lock.withPermit(
            Effect.gen(function* () {
              if (!(yield* authorized(event))) return;
              const result = reconcileNotifications(
                state,
                snapshot,
                DateTime.formatIso(yield* DateTime.now),
              );
              yield* commit(result.state);
              if (
                snapshot.notificationMode !== "notifications" &&
                snapshot.notificationMode !== "notifications-and-sound"
              )
                return;
              for (const item of result.added) {
                if (focused()) continue;
                if (!Notification.isSupported()) continue;
                const title = desktopNotificationTitles[item.kind];
                const lines = [item.threadTitle, `${item.projectTitle} · ${item.environmentTitle}`];
                const notification = new Notification({
                  id: item.id,
                  groupId: "t3-work",
                  title,
                  body: lines.join("\n"),
                  silent: true,
                  ...(mac ? {} : { toastXml: windowsToastXml({ id: item.id, title, lines }) }),
                });
                retain(item.id, notification);
                notification.show();
              }
            }),
          ),
      }),
    );
  },
);
