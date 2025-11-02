import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { stopInstructorTask, stopStudentScanningTask } from '../utils/backgroundTask';

// Define TypeScript interfaces
interface MenuItemBase {
  icon: string;
  label: string;
}

interface MenuItemWithPress extends MenuItemBase {
  onPress: () => void;
  type?: never;
  value?: never;
  onToggle?: never;
}

interface MenuItemWithToggle extends MenuItemBase {
  type: 'toggle';
  value: boolean;
  onToggle: () => void;
  onPress?: never;
}

type MenuItem = MenuItemWithPress | MenuItemWithToggle;

interface MenuSection {
  title: string;
  items: MenuItem[];
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  image_link?: string;
}

// Define navigation types
type RootStackParamList = {
  LoginScreen: undefined;
  HomeScreen: undefined;
  FaceVerify: undefined;
  // Add other screens as needed
};

export default function ProfileScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState({
    notifications: true,
    biometricLogin: false,
    darkMode: false,
  });

  // Load user data from AsyncStorage
  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await AsyncStorage.getItem('user');
        if (userData) setUser(JSON.parse(userData));
      } catch (error) {
        console.error('Failed to load user:', error);
      }
    };
    loadUser();
  }, []);

  // Function to get initials from name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Logout functionality from old Profile screen
  const handleLogout = async () => {
    try {
      await stopInstructorTask();
      await stopStudentScanningTask();
      await AsyncStorage.removeItem('user');
      await AsyncStorage.removeItem('token');
      // Use reset instead of replace for navigation
      navigation.reset({
        index: 0,
        routes: [{ name: 'LoginScreen' }],
      });
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  // Navigate to FaceVerify screen
  const navigateToFaceVerify = () => {
    navigation.navigate('FaceVerify');
  };

  const toggleSetting = (setting: keyof typeof settings) => {
    setSettings(prev => ({
      ...prev,
      [setting]: !prev[setting],
    }));
  };

  const handleEditProfile = () => {
    Alert.alert('Edit Profile', 'Profile editing feature coming soon!');
  };

  const handleChangePassword = () => {
    Alert.alert('Change Password', 'Password change feature coming soon!');
  };

  const handleEmailPreferences = () => {
    Alert.alert('Email Preferences', 'Email preferences feature coming soon!');
  };

  const handleHelpSupport = () => {
    Alert.alert('Help & Support', 'Help and support feature coming soon!');
  };

  const handleTermsOfService = () => {
    Alert.alert('Terms of Service', 'Terms of service feature coming soon!');
  };

  const handlePrivacyPolicy = () => {
    Alert.alert('Privacy Policy', 'Privacy policy feature coming soon!');
  };

  const menuItems: MenuSection[] = [
    {
      title: 'Account Settings',
      items: [
        { icon: '👤', label: 'Edit Profile', onPress: handleEditProfile },
        { icon: '🔒', label: 'Change Password', onPress: handleChangePassword },
        { icon: '📧', label: 'Email Preferences', onPress: handleEmailPreferences },
      ],
    },
    {
      title: 'Features',
      items: [
        {
          icon: '👁️',
          label: 'Face Verification',
          onPress: navigateToFaceVerify,
        },
      ],
    },
    {
      title: 'Preferences',
      items: [
        {
          icon: '🔔',
          label: 'Push Notifications',
          type: 'toggle',
          value: settings.notifications,
          onToggle: () => toggleSetting('notifications'),
        },
        {
          icon: '👁️',
          label: 'Biometric Login',
          type: 'toggle',
          value: settings.biometricLogin,
          onToggle: () => toggleSetting('biometricLogin'),
        },
        {
          icon: '🌙',
          label: 'Dark Mode',
          type: 'toggle',
          value: settings.darkMode,
          onToggle: () => toggleSetting('darkMode'),
        },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: '❓', label: 'Help & Support', onPress: handleHelpSupport },
        { icon: '📝', label: 'Terms of Service', onPress: handleTermsOfService },
        { icon: '🔏', label: 'Privacy Policy', onPress: handlePrivacyPolicy },
      ],
    },
  ];

  const renderMenuItem = (item: MenuItem, index: number) => {
    if (item.type === 'toggle') {
      return (
        <View
          key={index}
          className="flex-row items-center justify-between py-3 border-b border-gray-100 last:border-b-0"
        >
          <View className="flex-row items-center flex-1">
            <Text className="text-xl mr-3">{item.icon}</Text>
            <Text className="text-gray-700 font-medium">{item.label}</Text>
          </View>
          
          <TouchableOpacity
            onPress={item.onToggle}
            className={`w-12 h-6 rounded-full justify-center px-1 ${
              item.value ? 'bg-blue-500' : 'bg-gray-300'
            }`}
          >
            <View
              className={`w-4 h-4 rounded-full bg-white transform ${
                item.value ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <TouchableOpacity
        key={index}
        className="flex-row items-center justify-between py-3 border-b border-gray-100 last:border-b-0"
        onPress={item.onPress}
      >
        <View className="flex-row items-center flex-1">
          <Text className="text-xl mr-3">{item.icon}</Text>
          <Text className="text-gray-700 font-medium">{item.label}</Text>
        </View>
        <Text className="text-gray-400">›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white pt-12 pb-6 px-6">
        <Text className="text-2xl font-bold text-gray-800 text-center">
          Profile
        </Text>
      </View>

      {/* Profile Card - Using actual user data from AsyncStorage */}
      <View className="bg-white mx-4 my-4 rounded-2xl shadow-lg p-6">
        <View className="items-center mb-4">
          {/* Profile Image - Using actual user data */}
          {user?.image_link ? (
            <Image
              source={{ uri: user.image_link }}
              className="w-24 h-24 rounded-full mb-4 border-4 border-blue-500"
            />
          ) : (
            <View className="w-24 h-24 rounded-full bg-blue-500 justify-center items-center mb-4 border-4 border-blue-300">
              <Text className="text-white text-2xl font-bold">
                {getInitials(user?.name || 'User')}
              </Text>
            </View>
          )}
          
          <Text className="text-2xl font-bold text-gray-800">
            {user?.name || 'User'}
          </Text>
          <Text className="text-gray-500 text-sm mt-1">
            {user?.email || 'No email'}
          </Text>
          <View className="bg-blue-100 px-3 py-1 rounded-full mt-2">
            <Text className="text-blue-800 text-xs font-semibold">
              {user?.role ? `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} Member` : 'Member'}
            </Text>
          </View>
          {user?.id && (
            <Text className="text-gray-500 text-xs mt-1">
              ID: {user.id}
            </Text>
          )}
        </View>

        <View className="flex-row justify-between mt-4">
          <TouchableOpacity
            className="bg-blue-500 flex-1 mr-2 py-3 rounded-xl items-center"
            onPress={handleEditProfile}
          >
            <Text className="text-white font-semibold">Edit Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-red-500 flex-1 ml-2 py-3 rounded-xl items-center"
            onPress={() => {
              Alert.alert(
                'Logout',
                'Are you sure you want to logout?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Logout', 
                    style: 'destructive',
                    onPress: handleLogout
                  },
                ]
              );
            }}
          >
            <Text className="text-white font-semibold">Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Card */}
      <View className="bg-white mx-4 my-2 rounded-2xl shadow-lg p-4">
        <Text className="text-lg font-bold text-gray-800 mb-3">Statistics</Text>
        <View className="flex-row justify-between">
          <View className="items-center flex-1">
            <Text className="text-2xl font-bold text-blue-500">12</Text>
            <Text className="text-gray-500 text-xs">Face Scans</Text>
          </View>
          <View className="items-center flex-1">
            <Text className="text-2xl font-bold text-green-500">8</Text>
            <Text className="text-gray-500 text-xs">Successful</Text>
          </View>
          <View className="items-center flex-1">
            <Text className="text-2xl font-bold text-red-500">4</Text>
            <Text className="text-gray-500 text-xs">Failed</Text>
          </View>
        </View>
      </View>

      {/* Menu Sections */}
      {menuItems.map((section, sectionIndex) => (
        <View key={sectionIndex} className="bg-white mx-4 my-2 rounded-2xl shadow-lg p-4">
          <Text className="text-lg font-bold text-gray-800 mb-3">
            {section.title}
          </Text>
          {section.items.map((item, itemIndex) => renderMenuItem(item, itemIndex))}
        </View>
      ))}

      {/* App Info */}
      <View className="bg-white mx-4 my-4 rounded-2xl shadow-lg p-6 items-center">
        <Text className="text-gray-500 text-sm">App Version 1.0.0</Text>
        <Text className="text-gray-400 text-xs mt-1">
          {user ? `Member since ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : 'Not logged in'}
        </Text>
      </View>

      {/* Bottom Spacer */}
      <View className="h-8" />
    </ScrollView>
  );
}