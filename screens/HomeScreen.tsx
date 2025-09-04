import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import API_URL from "../api/apiConfig";
import { RefreshControl } from "react-native";

export default function HomeScreen({ navigation }: any) {
  const [user, setUser] = useState<any>(null);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUserAndSubjects();
    setRefreshing(false);
  };

  const dayMap: Record<string, number> = {
    M: 1,
    T: 2,
    W: 3,
    Th: 4,
    F: 5,
    S: 6,
    Su: 0,
  };

  const todayIndex = new Date().getDay(); // Sunday = 0, Monday = 1, ..., Saturday = 6

  const isTodaySchedule = (days: string) => {
    // First extract all day codes from the string
    const dayCodes: string[] = [];
    let i = 0;

    while (i < days.length) {
      // Check for "Th" (Thursday)
      if (days.substring(i, i + 2) === "Th") {
        dayCodes.push("Th");
        i += 2;
      }
      // Check for "Su" (Sunday)
      else if (days.substring(i, i + 2) === "Su") {
        dayCodes.push("Su");
        i += 2;
      }
      // Single character days
      else {
        const singleChar = days[i];
        if (["M", "T", "W", "F", "S"].includes(singleChar)) {
          dayCodes.push(singleChar);
        }
        i += 1;
      }
    }

    // Now check if any of the extracted day codes match today
    return dayCodes.some((dayCode) => dayMap[dayCode] === todayIndex);
  };

  const loadUserAndSubjects = async () => {
    try {
      const userData = await AsyncStorage.getItem("user");
      if (!userData) {
        navigation.replace("LoginScreen");
        return;
      }

      const parsedUser = JSON.parse(userData);
      setUser(parsedUser);

      const response = await fetch(
        `${API_URL}/getUserSubjectsAndSchedules?user_id=${parsedUser.id}`
      );
      const data = await response.json();
      if (response.ok) setSubjects(data.data || []);
    } catch (error) {
      console.error("Error loading user or subjects:", error);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadUserAndSubjects();
  }, []);

  // Debug: Log today's index and check if it's working
  console.log(
    "Today's index:",
    todayIndex,
    "Day:",
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][todayIndex]
  );

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="text-gray-500 mt-2">Loading...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <Text className="text-gray-500">Loading user...</Text>
      </View>
    );
  }

  const todaysSchedules = subjects.flatMap((item) =>
    item.schedules
      .filter((sched: any) => isTodaySchedule(sched.days))
      .map((sched: any) => ({ ...sched, subject: item }))
  );

  // Debug: Log the parsed day codes for each schedule
  subjects.forEach((item) => {
    item.schedules.forEach((sched: any) => {
      const dayCodes: string[] = [];
      let i = 0;
      while (i < sched.days.length) {
        if (sched.days.substring(i, i + 2) === "Th") {
          dayCodes.push("Th");
          i += 2;
        } else if (sched.days.substring(i, i + 2) === "Su") {
          dayCodes.push("Su");
          i += 2;
        } else {
          const singleChar = sched.days[i];
          if (["M", "T", "W", "F", "S"].includes(singleChar)) {
            dayCodes.push(singleChar);
          }
          i += 1;
        }
      }
      console.log(
        `Schedule ${sched.id}: "${sched.days}" ->`,
        dayCodes,
        "Includes Sunday:",
        dayCodes.includes("Su")
      );
    });
  });

  return (
    <View className="flex-1 bg-white px-4 pt-8">
      <Text className="text-2xl font-bold text-blue-600 mb-2">
        Welcome, {user.name} 🎉
      </Text>
      <Text className="text-lg font-bold text-blue-600 mb-4">
        Today's Schedules (
        {
          [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ][todayIndex]
        }
        )
      </Text>

      {todaysSchedules.length === 0 ? (
        <Text className="text-gray-500 text-center mt-6">
          No schedules for today 🎉
        </Text>
      ) : (
        <FlatList
          data={todaysSchedules}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate("ViewScheduleScreen", { schedule: item })
              }
            >
              <View className="bg-white rounded-2xl px-4 py-3 mb-3 border border-gray-200 shadow-sm">
                <Text className="text-sm font-bold text-gray-800">
                  {item.subject.subject_code} – {item.subject.description}
                </Text>
                <Text className="text-sm font-semibold text-blue-600 mt-1">
                  {item.schedule_type}
                </Text>
                <Text className="text-gray-700 text-sm">
                  {item.days}: {item.start_time} - {item.end_time}
                </Text>
                <Text className="text-gray-500 text-xs">{item.room}</Text>
              </View>
            </TouchableOpacity>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      <StatusBar style="auto" />
    </View>
  );
}
