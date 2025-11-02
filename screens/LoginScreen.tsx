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
import API_URL from "../api/apiConfig";

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
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ id: studentId, password }),
      });

      const data = await response.json();

      if (response.ok) {
        await AsyncStorage.setItem("user", JSON.stringify(data.user));
        await AsyncStorage.setItem("token", data.token);
        navigation.replace("HomeScreen");
      } else {
        Alert.alert("Login Failed", data.message || "Invalid credentials");
      }
    } catch (error: any) {
      console.error("Network Error:", error.message);
      Alert.alert("Error", "Could not connect to server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#50A8EE" }}>
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
            <View className="bg-white rounded-3xl shadow-xl p-6">
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

              {/* Student ID */}
              <View className="mb-4">
                <View className="flex-row items-center border border-gray-300 rounded-xl px-4 py-3 bg-gray-50">
                  <Ionicons name="id-card-outline" size={20} color="gray" />
                  <TextInput
                    className="flex-1 ml-3 placeholder:text-gray-400"
                    placeholder="Student ID"
                    value={studentId}
                    onChangeText={setStudentId}
                    autoCapitalize="none"
                    returnKeyType="next"
                  />
                </View>
              </View>

              {/* Password */}
              <View className="mb-6">
                <View className="flex-row items-center border border-gray-300 rounded-xl px-4 py-3 bg-gray-50">
                  <Ionicons name="lock-closed-outline" size={20} color="gray" />
                  <TextInput
                    className="flex-1 ml-3 placeholder:text-gray-400" // ✅ added text color
                    placeholder="Password"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    returnKeyType="done"
                    textContentType="password"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{
                      fontSize: 16,
                      fontFamily:
                        Platform.OS === "ios" ? "System" : "sans-serif",
                      color: "#000", // ✅ force black text (dots too)
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
                className="w-full py-6 rounded-xl flex-row justify-center items-center bg-[#50A8EE]"
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
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
