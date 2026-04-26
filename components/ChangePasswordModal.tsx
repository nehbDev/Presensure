import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons"; // Added for visibility icons
import { API_URL } from "../api/apiConfig";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ChangePasswordModal({ visible, onClose }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // States for toggling visibility
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert("Error", "New password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem("token");

      const response = await fetch(`${API_URL}/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          new_password_confirmation: confirmPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert("Success", "Password changed successfully");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        onClose();
      } else {
        const errorMsg = data.errors 
          ? Object.values(data.errors).flat().join("\n") 
          : data.message;
        Alert.alert("Error", errorMsg || "Failed to change password");
      }
    } catch (error) {
      console.error("Change Password Error:", error);
      Alert.alert("Error", "Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-center items-center bg-black/50 px-4"
      >
        <View className="bg-white w-full max-h-[85%] rounded-3xl p-6 shadow-xl">
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text className="text-2xl font-bold text-slate-800 mb-6">Change Password</Text>

            {/* Current Password */}
            <PasswordField
              label="Current Password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="••••••••"
              secureTextEntry={!showCurrent}
              onToggle={() => setShowCurrent(!showCurrent)}
              isVisible={showCurrent}
            />

            {/* New Password */}
            <PasswordField
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Min. 8 characters"
              secureTextEntry={!showNew}
              onToggle={() => setShowNew(!showNew)}
              isVisible={showNew}
            />

            {/* Confirm New Password */}
            <PasswordField
              label="Confirm New Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repeat new password"
              secureTextEntry={!showConfirm}
              onToggle={() => setShowConfirm(!showConfirm)}
              isVisible={showConfirm}
            />

            {/* Action Buttons */}
            <View className="flex-row justify-end gap-3 mt-4 pt-2">
              <TouchableOpacity
                onPress={onClose}
                className="bg-gray-100 px-6 py-3 rounded-xl active:bg-gray-200"
                disabled={loading}
              >
                <Text className="text-slate-600 font-bold">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleChangePassword}
                className="bg-blue-600 px-6 py-3 rounded-xl flex-row items-center active:bg-blue-700"
                disabled={loading}
              >
                {loading && <ActivityIndicator size="small" color="white" className="mr-2" />}
                <Text className="text-white font-bold">Save Changes</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Reusable Password Field Component with Toggle
const PasswordField = ({ label, value, onChangeText, placeholder, secureTextEntry, onToggle, isVisible }: any) => (
  <View className="mb-4">
    <Text className="text-slate-500 text-xs font-bold uppercase mb-1.5 ml-1">{label}</Text>
    <View className="flex-row items-center border border-gray-200 rounded-xl bg-gray-50 px-4 focus:border-blue-500">
      <TextInput
        className="flex-1 py-3 bg-gray-50 text-slate-800 font-semibold text-base"
        secureTextEntry={secureTextEntry}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
      />
      <TouchableOpacity onPress={onToggle}>
        <Ionicons 
          name={isVisible ? "eye-off-outline" : "eye-outline"} 
          size={20} 
          color="#64748B" 
        />
      </TouchableOpacity>
    </View>
  </View>
);