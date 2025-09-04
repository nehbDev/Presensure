import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Dimensions, TouchableOpacity, Text, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";

const Tab = createBottomTabNavigator();
const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  headerTitle: {
    fontWeight: "bold" as const,
  },
  logoutButton: {
    marginRight: 15,
    padding: 8,
    backgroundColor: "#ff3b30",
    borderRadius: 5,
  },
  logoutText: {
    color: "white",
    fontWeight: "bold" as const,
  },
});

export default function Layout({ screens, navigation: stackNavigation }: { screens: Record<string, any>; navigation: any }) {
  const navigation = useNavigation();

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem("user");
      stackNavigation.replace("LoginScreen");
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  // Header with logout button configuration
  const headerOptions: BottomTabNavigationOptions = {
    headerRight: () => (
      <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    ),
    headerStyle: {
      backgroundColor: "#50A8EE",
    },
    headerTintColor: "white",
    headerTitleStyle: styles.headerTitle,
  };

  // Tab bar options (separate from header options)
  const tabBarOptions: BottomTabNavigationOptions = {
    tabBarActiveTintColor: "#50A8EE",
    tabBarInactiveTintColor: "gray",
    tabBarShowLabel: true,
    tabBarStyle: {
      position: "absolute",
      bottom: 20,
      left: 0,
      right: 0,
      height: 60,
      borderRadius: 30,
      backgroundColor: "white",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.15,
      shadowRadius: 5,
      elevation: 5,
      borderTopWidth: 0,
    },
  };

  return (
    <Tab.Navigator
      screenOptions={{
        ...tabBarOptions,
        ...headerOptions,
      }}
    >
      {Object.entries(screens).map(([name, Component]) => (
        <Tab.Screen
          key={name}
          name={name}
          options={{
            ...headerOptions,
            title: name === "HomeScreen" ? "Home" : "Details",
          }}
        >
          {(props) => <Component {...props} />}
        </Tab.Screen>
      ))}
    </Tab.Navigator>
  );
}