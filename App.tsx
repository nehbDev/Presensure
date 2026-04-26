import React, { useEffect, useState } from "react";
import * as Notifications from "expo-notifications";
import {
  Platform,
  StatusBar,
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
} from "react-native";
import { NavigationContainer, RouteProp } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import "./global.css";

// Screens
import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import ViewScheduleScreen from "./screens/ViewScheduleScreen";
import ProfileScreen from "./screens/profileScreen";
import FaceVerify from "./screens/faceVerify";
import RecordsScreen from "./screens/RecordsScreen";
import ViewSessionsInstructor from "./screens/ViewSessionsInstructor";
import ViewSessionDetails from "./screens/ViewSessionDetails";
import ViewSessionsStudent from "./screens/ViewSessionsStudent";

// Components & Context
import Layout from "./components/Layout";
import { BLEConnectionProvider } from "./contexts/BLEConnectionContext";
import BackgroundStatusIndicator from "./components/BackgroundStatusIndicator";
//import InstructorConnectionIndicator from "./components/InstructorConnectionIndicator";
//import StudentConnectionIndicator from "./components/StudentConnectionIndicator";

import { navigationRef } from './utils/NavigationService'; // 👈 Import the ref

// ✅ 1. Updated Type Definitions
type RootStackParamList = {
  ViewScheduleScreen: {
    schedule: {
      schedule_id: number;
      subject_code: string;
      subject_description: string;
      room: string;
      days: string;
      start_time: string;
      end_time: string;
      schedule_type: string;
      instructor_name?: string;
    };
  };
  ViewSessionsStudent: {
    course_id: number;
    subject_code: string;
    schedule: any;
  };
  FaceVerify: {
    schedule: any;
    onVerificationSuccess: (verificationResult: boolean) => Promise<void>;
  };
  // ✅ Added new route definition
  ViewSessionsInstructor: {
    course_id: number;
    subject_code: string;
  };
  ViewSessionDetails: {
    session_id: number;
  };
  LoginScreen: undefined;
  HomeScreen: undefined;
};

type ViewScheduleScreenRouteProp = RouteProp<
  RootStackParamList,
  "ViewScheduleScreen"
>;

// Notification Handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBadge: false,
    shouldPlaySound: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldSetBadge: false,
  }),
});

const Stack = createNativeStackNavigator<RootStackParamList>();

// Custom Headers
const CustomHeader = ({ route }: { route?: ViewScheduleScreenRouteProp }) => {
  const schedule = route?.params?.schedule;
  const title = schedule?.schedule_id
    ? `${schedule.subject_code}`
    : "Schedule Details";
  return (
    <View style={customHeaderStyles.headerContainer}>
      <Text style={customHeaderStyles.headerGreeting}>{title}</Text>
    </View>
  );
};

const FaceVerifyHeader = () => (
  <View style={customHeaderStyles.headerContainer}>
    <Text style={customHeaderStyles.headerGreeting}>Face Verification</Text>
  </View>
);

const customHeaderStyles = StyleSheet.create({
  headerContainer: {
    backgroundColor: "#2563EB",
    paddingTop: Platform.OS === "ios" ? 10 : 6,
    paddingBottom: 10,
    paddingHorizontal: 16,
    justifyContent: "center",
    height: Platform.OS === "ios" ? 90 : 70,
  },
  headerGreeting: {
    color: "white",
    fontSize: 22,
    fontWeight: "bold",
  },
});

const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#2563EB" />
    <Text style={styles.loadingText}>Loading...</Text>
  </View>
);

export default function App() {
  const [userRole, setUserRole] = useState<"instructor" | "student" | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [userExists, setUserExists] = useState(false);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        const userData = await AsyncStorage.getItem("user");
        const token = await AsyncStorage.getItem("token");
        if (userData && token) {
          const parsedUser = JSON.parse(userData);
          setUserRole(parsedUser.role);
          setUserExists(true);
        } else {
          setUserExists(false);
        }
      } catch (error) {
        console.error("Error checking stored user:", error);
        setUserExists(false);
      }
    };

    const setupNotifications = async () => {
      try {
        const { status: existingStatus } =
          await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted") return;

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("ble-scan-channel", {
            name: "BLE Scan Notifications",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#FF231F7C",
            lockscreenVisibility:
              Notifications.AndroidNotificationVisibility.PUBLIC,
            bypassDnd: true,
          });
        }
      } catch (error) {
        console.error("Notification setup error:", error);
      }
    };

    Promise.all([initializeApp(), setupNotifications()]).finally(() =>
      setIsLoading(false),
    );

    const subscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log("Notification received:", notification);
      },
    );
    return () => subscription.remove();
  }, []);

  if (isLoading) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle={"light-content"} backgroundColor="#2563EB" />
        <SafeAreaView style={styles.safeArea}>
          <LoadingScreen />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={"light-content"} backgroundColor="#2563EB" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <BLEConnectionProvider>
            {/* ✅ NAVIGATION CONTAINER */}
            <NavigationContainer ref={navigationRef}>
              {/* ✅ FIX: Wrap everything in a View to provide a single child context */}
              <View style={{ flex: 1 }}>
                <Stack.Navigator
                  initialRouteName={userExists ? "HomeScreen" : "LoginScreen"}
                  screenOptions={{
                    headerStyle: { backgroundColor: "#2563EB" },
                    headerTintColor: "#fff",
                    contentStyle: { backgroundColor: "#fff" },
                  }}
                >
                  <Stack.Screen
                    name="LoginScreen"
                    component={LoginScreen}
                    options={{ headerShown: false }}
                  />

                  {/* ✅ 2. Registered new Screen */}
                  <Stack.Screen
                    name="ViewSessionsInstructor"
                    component={ViewSessionsInstructor}
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name="ViewSessionsStudent"
                    component={ViewSessionsStudent}
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name="ViewSessionDetails"
                    component={ViewSessionDetails} // Make sure to import it
                    options={{ headerShown: false }}
                  />

                  <Stack.Screen
                    name="ViewScheduleScreen"
                    component={ViewScheduleScreen}
                    options={({
                      route,
                    }: {
                      route: ViewScheduleScreenRouteProp;
                    }) => ({
                      header: () => <CustomHeader route={route} />,
                    })}
                  />

                  <Stack.Screen
                    name="FaceVerify"
                    component={FaceVerify}
                    options={{ header: () => <FaceVerifyHeader /> }}
                  />

                  <Stack.Screen
                    name="HomeScreen"
                    options={{ headerShown: false }}
                  >
                    {(props) => (
                      <Layout
                        {...props}
                        screens={{
                          HomeScreen: HomeScreen,
                          RecordsScreen: RecordsScreen, // ✅ Added Records
                          ProfileScreen: ProfileScreen,
                        }}
                      />
                    )}
                  </Stack.Screen>
                </Stack.Navigator>

                {/*Global Indicators (Now valid siblings inside the View) 
                {userRole === "instructor" && <InstructorConnectionIndicator />}
                {userRole === "student" && <StudentConnectionIndicator />}
                <BackgroundStatusIndicator />*/}
              </View>
            </NavigationContainer>
          </BLEConnectionProvider>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#2563EB" },
  container: { flex: 1, backgroundColor: "#fff" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  loadingText: { marginTop: 12, fontSize: 16, color: "#2563EB" },
});
