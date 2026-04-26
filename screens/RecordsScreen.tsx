import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  Dimensions,
  TextInput,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  MaterialCommunityIcons,
  FontAwesome5,
  Ionicons,
} from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { API_URL } from "../api/apiConfig";

// Import Skeleton
import ScheduleSkeleton from "../components/skeleton/ScheduleSkeleton";

const { width } = Dimensions.get("window");

export default function RecordsScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  const isTeachingStaff = (role: string) => {
    return ["instructor", "administrator", "admin"].includes(role?.toLowerCase());
  };

  const fetchRecords = async () => {
    try {
      const userData = await AsyncStorage.getItem("user");
      const token = await AsyncStorage.getItem("token");

      if (!userData) {
        setLoading(false);
        return;
      }

      const parsedUser = JSON.parse(userData);
      setUserRole(parsedUser.role);

      const response = await fetch(
        `${API_URL}/getCourses?user_id=${parsedUser.id}&role=${parsedUser.role}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Authorization": token ? `Bearer ${token}` : "",
          },
        }
      );

      const data = await response.json();

      if (data.success && data.my_records) {
        setRecords(data.my_records);
      } else {
        setRecords([]);
      }
    } catch (error) {
      console.error("Error fetching records:", error);
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRecords();
    setRefreshing(false);
  };

  const filteredRecords = records.filter((item) => {
    const query = searchQuery.toLowerCase();
    const subjectCode = item.subject_code ? item.subject_code.toLowerCase() : "";
    const description = item.description ? item.description.toLowerCase() : "";
    return subjectCode.includes(query) || description.includes(query);
  });

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-100">
        <View className="flex-1 px-4 pt-4">
          <View>
            {[1, 2, 3, 4, 5].map((key) => (
              <ScheduleSkeleton key={key} width={width - 32} />
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <View className="flex-1 px-4 pt-4">
        {/* Header Title */}
        <View className="mb-4">


          {/* Search Input */}
          <View className="flex-row items-center bg-white rounded-xl px-4 py-2 border border-gray-200 shadow-sm">
            <Ionicons name="search" size={20} color="#94A3B8" />
            <TextInput
              className="flex-1 ml-2 text-slate-700 text-base"
              placeholder="Search Subject Code or Name..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* List of Records */}
        <FlatList
          data={filteredRecords}
          keyExtractor={(item) => item.course_id.toString()}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#2563EB"]} />
          }
          ListEmptyComponent={
            <View className="flex-1 justify-center items-center mt-20">
              <MaterialCommunityIcons name="folder-open-outline" size={64} color="#CBD5E1" />
              <Text className="text-slate-500 text-lg mt-4">No records found</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => {
                if (isTeachingStaff(userRole)) {
                  navigation.navigate("ViewSessionsInstructor", {
                    course_id: item.course_id,
                    subject_code: item.subject_code,
                    schedule: item
                  });
                } else {
                  navigation.navigate("ViewSessionsStudent", {
                    course_id: item.course_id,
                    subject_code: item.subject_code,
                    schedule: {
                      ...item,
                      subject_description: item.description,
                      start_time: "00:00",
                      end_time: "00:00",
                      days: item.schedule?.split(" ")[0] || "TBA",
                      room: "TBA",
                    },
                  });
                }
              }}
              className="mb-4"
              style={{ width: width - 32 }}
            >
              <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
                
                {/* 1. Header: Subject Code + Description */}
                <View className="flex-row items-start mb-3">
                  <View className="bg-blue-100 h-10 w-10 rounded-full items-center justify-center mr-3 mt-1">
                    <FontAwesome5 name="book" size={16} color="#2563EB" />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row justify-between items-center">
                      <Text className="text-slate-500 text-xs font-bold uppercase tracking-wide">
                        {item.subject_code}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                    </View>
                    <Text className="text-slate-800 text-lg font-bold leading-6 mt-0.5" numberOfLines={2}>
                      {item.description}
                    </Text>
                  </View>
                </View>

                <View className="h-[1px] bg-gray-100 my-2" />

                {/* 2. Details Section - Stacked Vertically */}
                <View className="mt-2">
                  
                  {/* Row 1: Instructor Name (Only for Students) */}
                  {!isTeachingStaff(userRole) && (
                    <View className="mb-3">
                      <Text className="text-slate-400 text-[10px] font-bold uppercase mb-1">INSTRUCTOR</Text>
                      <View className="flex-row items-center">
                        <MaterialCommunityIcons name="account-tie" size={16} color="#64748B" />
                        <Text className="text-slate-700 text-sm font-medium ml-2 flex-1" numberOfLines={1}>
                          {item.instructor || "TBA"}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Row 2: Schedule Info (Always Visible) */}
                  <View>
                    <Text className="text-slate-400 text-[10px] font-bold uppercase mb-1">SCHEDULE</Text>
                    <View className="flex-row items-center">
                      <MaterialCommunityIcons name="calendar-clock" size={16} color="#64748B" />
                      <Text className="text-slate-700 text-sm font-medium ml-2">
                        {item.schedule || "No Schedule"}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 3. Footer Stats */}
                <View className="mt-4 flex-row gap-2">
                  <View className="bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 flex-row items-center">
                    <MaterialCommunityIcons name="history" size={14} color="#047857" style={{ marginRight: 4 }} />
                    <Text className="text-emerald-700 text-xs font-bold">
                      {item.total_sessions || 0} Sessions
                    </Text>
                  </View>

                  {/* Student Count - Only for Instructors/Admin */}
                  {isTeachingStaff(userRole) && (
                    <View className="bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 flex-row items-center">
                      <MaterialCommunityIcons name="account-group" size={14} color="#4338ca" style={{ marginRight: 4 }} />
                      <Text className="text-indigo-700 text-xs font-bold">
                        {item.total_students || 0} Students
                      </Text>
                    </View>
                  )}
                </View>

              </View>
            </TouchableOpacity>
          )}
        />
      </View>
    </SafeAreaView>
  );
}