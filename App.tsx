import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import ViewScheduleScreen from "./screens/ViewScheduleScreen";
import DetailsScreen from "./screens/DetailsScreen";
import Layout from "./components/Layout";
import "./global.css";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="LoginScreen">
        {/* Auth screen */}
        <Stack.Screen
          name="LoginScreen"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ViewScheduleScreen"
          component={ViewScheduleScreen}
          options={{ title: "Schedule Details" }}
        />
        {/* Tab layout (after login) */}
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
              }}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}