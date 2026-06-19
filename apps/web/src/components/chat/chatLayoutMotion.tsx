import { createContext, useContext } from "react";

const ChatLayoutMotionContext = createContext(false);

export const ChatLayoutMotionProvider = ChatLayoutMotionContext.Provider;

export function useChatLayoutMotionActive(): boolean {
  return useContext(ChatLayoutMotionContext);
}
