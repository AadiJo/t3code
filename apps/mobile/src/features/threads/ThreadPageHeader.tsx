import { StackActions, useNavigation } from "@react-navigation/native";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText as Text } from "../../components/AppText";
import { ControlPill, ControlPillMenu } from "../../components/ControlPill";
import { GlassSurface } from "../../components/GlassSurface";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useThreadGitHeaderActionItems } from "./ThreadGitControls";

function ThreadPageActions(props: {
  readonly gitControls: Parameters<typeof useThreadGitHeaderActionItems>[0];
}) {
  const items = useThreadGitHeaderActionItems(props.gitControls);
  const renderMenu = (
    item: typeof items.terminal | typeof items.git,
    icon: "terminal" | "point.topleft.down.curvedto.point.bottomright.up",
  ) => (
    <ControlPillMenu
      key={item.identifier}
      title={item.menu.title}
      isAnchoredToRight
      actions={item.menu.items.map((action, index) => ({
        id: String(index),
        title: action.label,
        subtitle: action.description,
        image: action.icon.name,
        attributes: { disabled: ("disabled" in item && item.disabled) || action.disabled || false },
      }))}
      onPressAction={({ nativeEvent }) => {
        const action = item.menu.items[Number(nativeEvent.event)];
        if (action && !("disabled" in item && item.disabled) && !action.disabled) action.onPress();
      }}
    >
      <ControlPill
        icon={icon}
        accessibilityLabel={item.accessibilityLabel}
        disabled={"disabled" in item ? item.disabled : false}
        className="bg-transparent"
      />
    </ControlPillMenu>
  );

  return (
    <GlassSurface chrome="none" className="flex-row">
      {renderMenu(items.terminal, "terminal")}
      <ControlPill
        icon="folder"
        accessibilityLabel={items.files.accessibilityLabel}
        disabled={items.files.disabled}
        onPress={items.files.onPress}
        className="bg-transparent"
      />
      {renderMenu(items.git, "point.topleft.down.curvedto.point.bottomright.up")}
    </GlassSurface>
  );
}

/** A page-owned header moves with the native stack's interactive back gesture. */
export function ThreadPageHeader(props: {
  readonly title: string;
  readonly subtitle?: string;
  readonly gitControls?: Parameters<typeof useThreadGitHeaderActionItems>[0];
  readonly onReturnToThread?: () => void;
}) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  return (
    <>
      <NativeStackScreenOptions options={{ headerShown: false, gestureEnabled: true }} />
      <View className="bg-screen px-3" style={{ paddingTop: insets.top }}>
        <View className="min-h-11 flex-row items-center gap-2">
          <GlassSurface chrome="none">
            <ControlPill
              icon="chevron.left"
              accessibilityLabel={props.onReturnToThread ? "Return to chat" : "Go to threads list"}
              className="bg-transparent"
              onPress={() => {
                if (props.onReturnToThread) props.onReturnToThread();
                else if (navigation.canGoBack()) navigation.goBack();
                else navigation.dispatch(StackActions.replace("Home"));
              }}
            />
          </GlassSurface>
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="font-t3-bold text-base text-foreground">
              {props.title}
            </Text>
            {props.subtitle ? (
              <Text numberOfLines={1} className="text-xs text-foreground-muted">
                {props.subtitle}
              </Text>
            ) : null}
          </View>
          {props.gitControls ? <ThreadPageActions gitControls={props.gitControls} /> : null}
        </View>
      </View>
    </>
  );
}
