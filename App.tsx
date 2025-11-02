import React, { useEffect, useState } from "react";
import * as Notifications from "expo-notifications";
import { Platform, StatusBar, StyleSheet, View, Text } from "react-native";
import { NavigationContainer, RouteProp } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Screens
import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import ViewScheduleScreen from "./screens/ViewScheduleScreen";
import DetailsScreen from "./screens/DetailsScreen";
import ProfileScreen from "./screens/profileScreen";
import FaceVerify from "./screens/faceVerify";

// Components & Context
import Layout from "./components/Layout";
import { BLEConnectionProvider } from "./contexts/BLEConnectionContext";
import GlobalConnectionIndicator from "./components/GlobalConnectionIndicator";
import BackgroundStatusIndicator from "./components/BackgroundStatusIndicator";
import InstructorConnectionIndicator from "./components/InstructorConnectionIndicator";
import StudentConnectionIndicator from "./components/StudentConnectionIndicator";

import "./global.css";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

// ✅ Define the types for your route parameters
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
  FaceVerify: {
    schedule: any;
    onVerificationSuccess: (verificationResult: boolean) => Promise<void>;
  };
  LoginScreen: undefined;
  HomeScreen: undefined;
};

type ViewScheduleScreenRouteProp = RouteProp<RootStackParamList, 'ViewScheduleScreen'>;

// ✅ Notification setup
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

// ✅ Custom Header Component that shows schedule_id
const CustomHeader = ({ route }: { route?: ViewScheduleScreenRouteProp }) => {
  const schedule = route?.params?.schedule;
  
  const title = schedule?.schedule_id 
    ? `${schedule.subject_code}`
    : "Schedule Details";

  return (
    <View style={customHeaderStyles.headerContainer}>
      <Text style={customHeaderStyles.headerGreeting}>
        {title}
      </Text>
    </View>
  );
};

const customHeaderStyles = StyleSheet.create({
  headerContainer: {
    backgroundColor: "#50A8EE",
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

// ✅ Custom Header for FaceVerify (if needed)
const FaceVerifyHeader = () => (
  <View style={customHeaderStyles.headerContainer}>
    <Text style={customHeaderStyles.headerGreeting}>
      Face Verification
    </Text>
  </View>
);

export default function App() {
  const [userRole, setUserRole] = useState<"instructor" | "student" | null>(
    null
  );

  useEffect(() => {
    const setupNotifications = async () => {
      try {
        const { status: existingStatus } =
          await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== "granted") {
          console.log("Notification permission not granted");
          return;
        }

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("ble-scan-channel", {
            name: "BLE Scan Notifications",
            importance: Notifications.AndroidImportance.MAX,
            sound: "default",
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#FF231F7C",
            lockscreenVisibility:
              Notifications.AndroidNotificationVisibility.PUBLIC,
            enableLights: false,
            enableVibrate: false,
            showBadge: false,
            bypassDnd: true,
            description: "Notifications for BLE attendance scanning",
          });
        }
      } catch (error) {
        console.error("Notification setup error:", error);
      }
    };

    setupNotifications();

    const subscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log("Notification received:", notification);
      }
    );

    const loadUserRole = async () => {
      try {
        const userData = await AsyncStorage.getItem("user");
        if (userData) {
          const parsedUser = JSON.parse(userData);
          setUserRole(parsedUser.role);
        }
      } catch (error) {
        console.error("Error loading user role:", error);
      }
    };

    loadUserRole();

    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={'light-content'} backgroundColor="#50A8EE" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <BLEConnectionProvider>
            <NavigationContainer>
              <Stack.Navigator
                initialRouteName="LoginScreen"
                screenOptions={{
                  headerStyle: { backgroundColor: "#50A8EE" },
                  headerTintColor: "#fff",
                  contentStyle: { backgroundColor: "#fff" },
                }}
              >
                <Stack.Screen
                  name="LoginScreen"
                  component={LoginScreen}
                  options={{ headerShown: false }}
                />

                {/* ViewScheduleScreen with schedule_id in title */}
                <Stack.Screen
                  name="ViewScheduleScreen"
                  component={ViewScheduleScreen}
                  options={({ route }: { route: ViewScheduleScreenRouteProp }) => ({
                    header: () => <CustomHeader route={route} />,
                  })}
                />

                {/* FaceVerify with regular title */}
                <Stack.Screen
                  name="FaceVerify"
                  component={FaceVerify}
                  options={{
                    header: () => <FaceVerifyHeader />,
                  }}
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
                        DetailsScreen: DetailsScreen,
                        ProfileScreen: ProfileScreen,
                      }}
                    />
                  )}
                </Stack.Screen>
              </Stack.Navigator>

              {/* ✅ Connection & Background Indicators */}
              {userRole === "instructor" && <InstructorConnectionIndicator />}
              {userRole === "student" && <StudentConnectionIndicator />}
              <GlobalConnectionIndicator />
              <BackgroundStatusIndicator />
            </NavigationContainer>
          </BLEConnectionProvider>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#50A8EE",
  },
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
});