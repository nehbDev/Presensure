import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  Alert,
  ImageSourcePropType
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { stopInstructorTask, stopStudentScanningTask } from '../utils/backgroundTask';

// ✅ Import Modals
import ChangePasswordModal from '../components/ChangePasswordModal';
import AttendancePolicyModal from '../components/AttendancePolicyModal';

const defaultProfileImage = require('../assets/noProfile.webp');

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  image_link?: string;
  student_no?: string;
}

type RootStackParamList = {
  LoginScreen: undefined;
  HomeScreen: undefined;
};

export default function ProfileScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [user, setUser] = useState<User | null>(null);
  
  // ✅ Modal States
  const [isPasswordModalVisible, setPasswordModalVisible] = useState(false);
  const [isPolicyModalVisible, setPolicyModalVisible] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await AsyncStorage.getItem('user');
        if (userData) {
          setUser(JSON.parse(userData));
        }
      } catch (error) {
        console.error('Failed to load user:', error);
      }
    };
    loadUser();
  }, []);

  const isStaff = () => {
    const role = user?.role?.toLowerCase();
    return role === 'instructor' || role === 'administrator' || role === 'admin';
  };

  const handleLogout = async () => {
    try {
      await stopInstructorTask();
      await stopStudentScanningTask();
      await AsyncStorage.removeItem('user');
      await AsyncStorage.removeItem('token');
      
      navigation.reset({
        index: 0,
        routes: [{ name: 'LoginScreen' }],
      });
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const profileSource: ImageSourcePropType = user?.image_link
    ? { uri: user.image_link }
    : defaultProfileImage;

  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-blue-600 pb-10 pt-6 px-6 rounded-b-md shadow-md">
        <Text className="text-2xl font-bold text-white">Profile</Text>
      </View>

      {/* Main Content */}
      <View className="px-4 -mt-8 pb-10">
        
        {/* Profile Card */}
        <View className="bg-white rounded-2xl shadow-sm p-6 mb-4 items-center">
          <Image
            source={profileSource}
            className="w-28 h-28 rounded-full border-4 border-white shadow-sm -mt-16 mb-3 bg-gray-200"
          />
          
          <Text className="text-2xl font-bold text-slate-800 text-center">
            {user?.name || 'Guest User'}
          </Text>
          
          <Text className="text-slate-500 text-md font-medium mb-2">
            {user?.student_no || user?.id || 'No ID'}
          </Text>

          <View className="bg-blue-50 px-4 py-1.5 rounded-full border border-blue-100">
            <Text className="text-blue-700 text-xs font-bold uppercase tracking-wider">
              {user?.role || 'User'}
            </Text>
          </View>
        </View>

        {/* Menu Buttons */}
        <View className="bg-white rounded-2xl shadow-sm p-2 mb-4">
          
          {/* ✅ Change Password Button */}
          <MenuButton 
            icon="lock-closed-outline" 
            label="Change Password" 
            onPress={() => setPasswordModalVisible(true)} 
          />

          {isStaff() && <View className="h-[1px] bg-gray-100 mx-4" />}

          {/* ✅ Attendance Policy Button */}
          {isStaff() && (
            <MenuButton 
              icon="clipboard-outline" 
              label="My Attendance Policy" 
              onPress={() => setPolicyModalVisible(true)} 
            />
          )}
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          className="bg-white flex-row items-center justify-center py-4 rounded-2xl shadow-sm border border-red-100 active:bg-red-50"
          onPress={() => {
            Alert.alert(
              'Logout',
              'Are you sure you want to logout?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Logout', style: 'destructive', onPress: handleLogout },
              ]
            );
          }}
        >
          <MaterialCommunityIcons name="logout" size={20} color="#EF4444" />
          <Text className="text-red-500 font-bold text-lg ml-2">Logout</Text>
        </TouchableOpacity>

      </View>

      {/* ✅ Render Modals */}
      <ChangePasswordModal 
        visible={isPasswordModalVisible} 
        onClose={() => setPasswordModalVisible(false)} 
      />
      
      {isStaff() && (
        <AttendancePolicyModal 
          visible={isPolicyModalVisible} 
          onClose={() => setPolicyModalVisible(false)} 
        />
      )}

    </ScrollView>
  );
}

// Reusable Menu Button
const MenuButton = ({ icon, label, onPress }: { icon: any, label: string, onPress: () => void }) => (
  <TouchableOpacity 
    className="flex-row items-center p-4 active:bg-gray-50 rounded-xl"
    onPress={onPress}
  >
    <View className="bg-gray-100 p-2 rounded-full mr-4">
      <Ionicons name={icon} size={22} color="#4B5563" />
    </View>
    <Text className="text-slate-700 text-base font-semibold flex-1">
      {label}
    </Text>
    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
  </TouchableOpacity>
);