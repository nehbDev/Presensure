import React, { useEffect, useState, } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  Dimensions,
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  Image,
  Platform,
  StatusBar
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { Ionicons, MaterialIcons, FontAwesome5 } from "@expo/vector-icons";
import { stopInstructorTask, stopStudentScanningTask } from "../utils/backgroundTask";
import ProfileScreen from "../screens/profileScreen"; // ✅ Import ProfileScreen

const Tab = createBottomTabNavigator();
const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: "#50A8EE",
    paddingTop: Platform.OS === "ios" ? 10 : 6,
    paddingBottom: 10,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  headerGreeting: {
    color: "white",
    fontSize: 15,
    marginBottom: 2,
  },
  headerName: {
    color: "white",
    fontSize: 22,
    fontWeight: "bold",
  },
  tabBarStyle: {
    position: "absolute",
    bottom: 15,
    marginHorizontal: 20,
    height: 70, // ensures icons + labels are fully visible
    borderRadius: 30,
    backgroundColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 5,
    borderTopWidth: 0,
    paddingBottom: 10,
  },
});


interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  image_link?: string;
}

export default function Layout({
  screens,
  navigation: stackNavigation,
}: {
  screens: Record<string, any>;
  navigation: any;
}) {
  const navigation = useNavigation();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await AsyncStorage.getItem("user");
        if (userData) setUser(JSON.parse(userData));
      } catch (error) {
        console.error("Failed to load user:", error);
      }
    };
    loadUser();
  }, []);

  const handleLogout = async () => {
    try {
      await stopInstructorTask();
      await stopStudentScanningTask();
      await AsyncStorage.removeItem("user");
      await AsyncStorage.removeItem("token");
      stackNavigation.replace("LoginScreen");
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const headerComponent = () => (
    <View style={styles.headerContainer}>
      <Text style={styles.headerGreeting}>Good morning,</Text>
      <Text style={styles.headerName}>{user?.name || "User"}!</Text>
    </View>
  );

  const tabBarOptions = {
  tabBarActiveTintColor: "#50A8EE",
  tabBarInactiveTintColor: "gray",
  tabBarShowLabel: true,
  tabBarLabelStyle: { fontSize: 12, marginBottom: 4 },
  tabBarIconStyle: { marginTop: 4 },
  tabBarStyle: styles.tabBarStyle,
};

  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        return {
          ...tabBarOptions,
          tabBarIcon: ({ color, size }) => {
            if (route.name === "HomeScreen")
              return <Ionicons name="home" size={size} color={color} />;
            if (route.name === "DetailsScreen")
              return (
                <MaterialIcons name="list-alt" size={size} color={color} />
              );
            if (route.name === "ProfileScreen")
              return (
                <FontAwesome5 name="user-circle" size={size} color={color} />
              );
            return null;
          },
          header: () =>
            route.name === "ProfileScreen" ? undefined : headerComponent(),
        };
      }}
    >
      {Object.entries(screens).map(([name, Component]) => (
        <Tab.Screen
          key={name}
          name={name}
          options={{
            title:
              name === "HomeScreen"
                ? "Home"
                : name === "DetailsScreen"
                  ? "Details"
                  : name === "ProfileScreen"
                    ? "Profile" // ✅ Set title for ProfileScreen
                    : name,
          }}
        >
          {(props) => <Component {...props} />}
        </Tab.Screen>
      ))}
    </Tab.Navigator>
  );
}