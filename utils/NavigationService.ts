// utils/NavigationService.ts
import { createNavigationContainerRef } from '@react-navigation/native';

// 1. Create the reference
export const navigationRef = createNavigationContainerRef<any>();

// 2. Create a helper function to navigate from anywhere
export function navigate(name: string, params?: any) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  } else {
    console.warn("⚠️ Navigation Service: Navigation container is not ready yet.");
  }
}

// 3. Helper to go back
export function goBack() {
  if (navigationRef.isReady() && navigationRef.canGoBack()) {
    navigationRef.goBack();
  }
}