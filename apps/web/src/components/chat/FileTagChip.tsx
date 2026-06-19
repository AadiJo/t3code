import { inferEntryKindFromPath } from "../../pierre-icons";
import {
  CHAT_INLINE_CHIP_CLASS_NAME,
  CHAT_INLINE_CHIP_LABEL_CLASS_NAME,
  COMPOSER_INLINE_CHIP_CLASS_NAME,
  COMPOSER_INLINE_CHIP_ICON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME,
} from "../composerInlineChip";
import { PierreEntryIcon } from "./PierreEntryIcon";
import { useChatLayoutMotionActive } from "./chatLayoutMotion";

export const FILE_TAG_CHIP_CLASS_NAME = COMPOSER_INLINE_CHIP_CLASS_NAME;
export const CHAT_FILE_TAG_CHIP_CLASS_NAME = CHAT_INLINE_CHIP_CLASS_NAME;

export function FileTagChipContent(props: {
  path: string;
  label: string;
  theme: "light" | "dark";
  selectable?: boolean;
}) {
  const layoutMotionActive = useChatLayoutMotionActive();
  const labelClassName = props.selectable
    ? layoutMotionActive
      ? "min-w-0 overflow-hidden whitespace-nowrap leading-tight"
      : CHAT_INLINE_CHIP_LABEL_CLASS_NAME
    : COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME;

  return (
    <>
      <PierreEntryIcon
        pathValue={props.path}
        kind={inferEntryKindFromPath(props.path)}
        theme={props.theme}
        className={COMPOSER_INLINE_CHIP_ICON_CLASS_NAME}
      />
      <span className={labelClassName}>{props.label}</span>
    </>
  );
}
