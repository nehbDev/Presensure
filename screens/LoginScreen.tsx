import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  SafeAreaView,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
// ✅ Import the new service instead of the URL string
import apiService from "../api/apiConfig";

export default function LoginScreen({ navigation }: any) {
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!studentId || !password) {
      Alert.alert("Error", "Please enter Student ID and Password");
      return;
    }
    setLoading(true);

    try {
      // ✅ Use apiService instead of fetch
      // This automatically uses the correct URL (https://presensure.online/api)
      const response = await apiService.post("/login", {
        id: studentId,
        password: password,
      });

      console.log("[Login Success]", response.data);

      if (response.data) {
        await AsyncStorage.setItem("user", JSON.stringify(response.data.user));
        await AsyncStorage.setItem("token", response.data.token);
        navigation.replace("HomeScreen");
      }
    } catch (error: any) {
      console.error("Login Error:", error);
      // specific error message from Laravel or generic one
      const message =
        error.response?.data?.message || "Invalid credentials or Server Error";
      Alert.alert("Login Failed", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <StatusBar style="light" />
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              paddingHorizontal: 24,
              paddingVertical: 40,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Logo + Title */}
            <View className="items-center mb-6">
              <Image
                source={require("../assets/logo.webp")}
                className="h-28 w-28"
                resizeMode="contain"
              />
              <Text className="text-2xl font-bold text-gray-900 mt-4">
                Welcome Back!
              </Text>
              <Text className="text-gray-500 mt-1">Sign in to continue</Text>
            </View>

            {/* Student ID Input */}
            <View className="mb-4">
              <Text className="text-gray-700 mb-2 font-medium ml-1">
                Student ID
              </Text>
              <View className="flex-row items-center border border-gray-300 rounded-full px-6 py-3 bg-gray-50">
                <Ionicons name="id-card-outline" size={20} color="gray" />
                <TextInput
                  className="flex-1 ml-3 placeholder:text-gray-400"
                  // ✅ Updated Placeholder
                  placeholder="Example: C-0000-0000"
                  value={studentId}
                  onChangeText={setStudentId}
                  autoCapitalize="none"
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Password Input */}
            <View className="mb-6">
              <Text className="text-gray-700 mb-2 font-medium ml-1">
                Password
              </Text>
              <View className="flex-row items-center border border-gray-300 rounded-full px-6 py-3 bg-gray-50">
                <Ionicons name="lock-closed-outline" size={20} color="gray" />
                <TextInput
                  className="flex-1 ml-3 placeholder:text-gray-400"
                  placeholder="Default: lastname"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  returnKeyType="done"
                  textContentType="password"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    fontSize: 16,
                    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
                    color: "#000000",
                  }}
                />

                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons
                    name={showPassword ? "eye-off" : "eye"}
                    size={20}
                    color="gray"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Login Button */}
            <Pressable
              onPress={handleLogin}
              disabled={loading}
              className={`w-full py-6 rounded-full flex-row justify-center items-center ${
                loading ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"
              }`}
              style={{
                elevation: 12,
                shadowColor: "#000",
                shadowOpacity: 0.9,
                shadowOffset: { width: 0, height: 8 },
                shadowRadius: 12,
              }}
            >
              {loading ? (
                <View className="flex-row justify-center items-center">
                  <ActivityIndicator color="#fff" size="small" />
                  <Text className="text-white font-semibold ml-2">
                    Signing in...
                  </Text>
                </View>
              ) : (
                <Text className="text-white font-semibold text-center">
                  Login
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
