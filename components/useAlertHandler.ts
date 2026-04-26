// utils/useAlertHandler.ts
import { useCallback, useRef } from "react";
import { Alert } from "react-native";

export function useAlertHandler() {
  const lastAlertRef = useRef<Map<string, number>>(new Map());

  const showAlert = useCallback((title: string, message: string, key?: string) => {
    const now = Date.now();
    const alertKey = key || `${title}:${message}`;
    const lastShown = lastAlertRef.current.get(alertKey) || 0;

    if (now - lastShown < 3000) {
      // Suppress if duplicate within 3 seconds
      return;
    }

    lastAlertRef.current.set(alertKey, now);

    Alert.alert(title, message);
  }, []);

  return { showAlert };
}
