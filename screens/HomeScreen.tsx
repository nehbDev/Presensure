import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../api/apiConfig";
import ScheduleSkeleton from "../components/skeleton/ScheduleSkeleton";

// --- Helper: Parse schedule days like "MTWThFSSu"
const parseDayCodes = (days: string): string[] => {
  const codes: string[] = [];
  let i = 0;

  while (i < days.length) {
    if (days.substring(i, i + 2) === "Th") {
      codes.push("Th");
      i += 2;
    } else if (days.substring(i, i + 2) === "Su") {
      codes.push("Su");
      i += 2;
    } else {
      codes.push(days[i]);
      i += 1;
    }
  }
  return codes;
};

const dayMap: Record<string, number> = {
  M: 1, T: 2, W: 3, Th: 4, F: 5, S: 6, Su: 0,
};

const parseTimeToMinutes = (timeStr: string) => {
  const [hoursStr, minutesStr] = timeStr.split(":");
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  return hours * 60 + minutes;
};

const normalizeDays = (days: string): string => {
  const codes = parseDayCodes(days);
  return codes.join("");
};

export default function HomeScreen({ navigation }: any) {
  const [user, setUser] = useState<any>(null);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"today" | "all">("today");
  const [selectedDayGroup, setSelectedDayGroup] = useState<string | null>(null);

  const windowWidth = Dimensions.get("window").width;

  const loadUserAndSubjects = async () => {
    try {
      const userData = await AsyncStorage.getItem("user");
      if (!userData) return;

      const parsedUser = JSON.parse(userData);
      setUser(parsedUser);

      const platform = "mobile";

      const response = await fetch(
        `${API_URL}/getUserCoursesAndSchedules?user_id=${parsedUser.id}&platform=${platform}`
      );

      const data = await response.json();
      if (response.ok) {
        setSubjects(data.data || []);
      }
    } catch (error) {
      console.error("Error loading user or subjects:", error);
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUserAndSubjects();
    setRefreshing(false);
  };

  useEffect(() => {
    loadUserAndSubjects();
  }, []);

  const formatTime = (timeStr: string) => {
    const [hoursStr, minutesStr] = timeStr.split(":");
    let hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);

    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    if (hours === 0) hours = 12;

    return `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
  };

  const isScheduleActive = (schedule: any, ignoreDayCheck = false) => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

    const scheduleCodes = parseDayCodes(schedule.days || "");
    if (
      !ignoreDayCheck &&
      !scheduleCodes.some((code) => dayMap[code] === currentDay)
    ) {
      return false;
    }

    const startMinutes = parseTimeToMinutes(schedule.start_time);
    const endMinutes = parseTimeToMinutes(schedule.end_time);

    return (
      currentTimeMinutes >= startMinutes && currentTimeMinutes <= endMinutes
    );
  };

  const generateUniqueKey = (item: any, index: number) => {
    if (item.schedule_id) return `schedule-${item.schedule_id}`;
    if (item.id) return `item-${item.id}`;
    return `schedule-${item.course_id}-${item.days}-${item.start_time}-${item.end_time}-${index}`;
  };

  const getFilteredSchedules = () => {
    const now = new Date();
    const currentDay = now.getDay();
    // Get current time in minutes (e.g., 14:30 = 870 minutes)
    const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

    if (activeTab === "all") {
      let allSchedules = [...subjects];

      if (selectedDayGroup) {
        allSchedules = allSchedules.filter(
          (s) => normalizeDays(s.days) === selectedDayGroup
        );
      }

      allSchedules.sort((a, b) => {
        const aActive = isScheduleActive(a, false);
        const bActive = isScheduleActive(b, false);
        if (aActive !== bActive) return aActive ? -1 : 1;
        return (
          parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time)
        );
      });

      return allSchedules;
    }

    // --- UPDATED "TODAY" LOGIC ---
    const todaySchedules = subjects.filter((schedule) => {
      const scheduleCodes = parseDayCodes(schedule.days || "");
      
      // 1. Check if the schedule is for today
      const isToday = scheduleCodes.some((code) => dayMap[code] === currentDay);
      
      if (!isToday) return false;

      // 2. Check if the schedule has NOT ended yet
      const endMinutes = parseTimeToMinutes(schedule.end_time);
      
      // We keep the schedule if Current Time <= End Time
      return currentTimeMinutes <= endMinutes;
    });

    return todaySchedules.sort((a, b) => {
      const aActive = isScheduleActive(a, false);
      const bActive = isScheduleActive(b, false);
      if (aActive !== bActive) return aActive ? -1 : 1;
      return (
        parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time)
      );
    });
  };

  return (
    <View className="flex-1 bg-gray-100 px-4 pt-4">
      {/* Tabs */}
      <View className="flex-row justify-between mb-6 bg-gray-200 rounded-full p-2">
        <TouchableOpacity
          className={`flex-1 py-2 rounded-full ${
            activeTab === "today" ? "bg-white" : ""
          }`}
          onPress={() => setActiveTab("today")}
        >
          <Text
            className={`text-center font-semibold ${
              activeTab === "today" ? "text-gray-700" : "text-gray-500"
            }`}
          >
            Today's Schedule
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className={`flex-1 py-2 rounded-full ${
            activeTab === "all" ? "bg-white" : ""
          }`}
          onPress={() => setActiveTab("all")}
        >
          <Text
            className={`text-center font-semibold ${
              activeTab === "all" ? "text-gray-700" : "text-gray-500"
            }`}
          >
            All Schedule
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content Area: Loading Skeleton OR Real List */}
      {loading ? (
        <View>
          {[1, 2, 3, 4, 5].map((key) => (
            <ScheduleSkeleton key={key} width={windowWidth - 32} />
          ))}
        </View>
      ) : (
        <FlatList
          data={getFilteredSchedules()}
          keyExtractor={(item, index) => generateUniqueKey(item, index)}
          numColumns={1}
          renderItem={({ item }) => {
            const active = isScheduleActive(item, false);

            return (
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("ViewScheduleScreen", {
                    schedule: item,
                    headerTitle: `Schedule #${item.schedule_id}`,
                  })
                }
                style={{ width: windowWidth - 32, marginBottom: 16 }}
              >
                <View
                  className="bg-white rounded-2xl p-5 shadow-lg flex flex-col justify-between"
                  style={{
                    borderWidth: active ? 3 : 1,
                    borderColor: active ? "#34D399" : "#e5e7eb",
                    elevation: 5,
                    minHeight: 140,
                  }}
                >
                  {/* Top section: Subject Title */}
                  <View className="flex-row items-center mb-2">
                    <View className="bg-blue-100 rounded-full p-2 mr-2">
                      <Text className="text-blue-600 font-bold">📘</Text>
                    </View>
                    <Text className="text-gray-900 text-lg font-semibold flex-1 flex-wrap">
                      {item.subject_description || "No Subject"}
                    </Text>
                  </View>

                  {/* Days and Room */}
                  <Text className="text-gray-600 text-sm mb-2">
                    {item.days || "No days"} | {item.room || "No room"}
                  </Text>

                  {/* Time and Schedule Type in one row */}
                  <View className="flex-row justify-between items-center">
                    <Text className="text-blue-600 text-base font-medium">
                      {formatTime(item.start_time)} -{" "}
                      {formatTime(item.end_time)}
                    </Text>
                    <View className="bg-blue-50 px-3 py-1 rounded-full">
                      <Text className="text-blue-600 text-xs font-medium uppercase">
                        {item.schedule_type || "Regular"}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#3b82f6"]}
              tintColor="#3b82f6"
            />
          }
          contentContainerStyle={{ paddingBottom: 70 }}
          ListEmptyComponent={
            <View className="flex-1 justify-center items-center mt-10">
              <Text className="text-center text-gray-500 text-lg">
                No upcoming schedules
              </Text>
              <Text className="text-center text-gray-400 mt-2 px-6">
                {activeTab === "today"
                  ? "You have no more classes for today!"
                  : "No schedules available"}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}