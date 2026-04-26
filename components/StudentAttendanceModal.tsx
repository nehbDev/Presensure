import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Student } from './InstructorStudentListView';

interface StudentDetailModalProps {
  visible: boolean;
  student: Student | null;
  onClose: () => void;
}

const StudentAttendanceModal: React.FC<StudentDetailModalProps> = ({
  visible,
  student,
  onClose,
}) => {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.9)).current;

  React.useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);
      
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  if (!student) return null;

  const formatStudentName = () => {
    let name = `${student.lastname}, ${student.firstname}`;
    if (student.middle_initial) name += ` ${student.middle_initial}.`;
    if (student.suffix) name += ` ${student.suffix}`;
    return name;
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // --- UPDATED: Aligned Status Logic ---
  const getEffectiveStatus = () => {
    const rawStatus = student.attendance_status?.toLowerCase();
    const isMarked = !!student.marked_at;

    let isPresent = false;
    let isLate = false;
    let isExcused = false;

    // 1. Determine Base State
    if (rawStatus === 'excused') {
        isExcused = true;
    } else if (rawStatus === 'present' || (isMarked && rawStatus !== 'late')) {
        isPresent = true;
    } else if (rawStatus === 'late') {
        isLate = true;
    }

    // 2. Determine Visuals & Text (Matches InstructorStudentListView exactly)
    if (isExcused) {
      return {
          text: "EXCUSED",
          textColor: "text-purple-700",
          icon: "document-text",
          iconColor: "#7e22ce", // Purple-700
          bgColor: "bg-purple-100",
          isExcused: true
      };
    } else if (isPresent) {
      return {
          text: "PRESENT",
          textColor: "text-green-700",
          icon: "checkmark-circle",
          iconColor: "#15803d", // Green-700
          bgColor: "bg-green-100",
          isExcused: false
      };
    } else if (isLate) {
      return {
          text: "LATE",
          textColor: "text-yellow-700",
          icon: "time",
          iconColor: "#a16207", // Yellow-700
          bgColor: "bg-yellow-100",
          isExcused: false
      };
    } else {
      return {
          text: "ABSENT",
          textColor: "text-gray-500",
          icon: "close-circle-outline", // Matched with list view
          iconColor: "#6b7280", // Gray-500
          bgColor: "bg-gray-100",
          isExcused: false
      };
    }
  };
  
  const effectiveStatus = getEffectiveStatus();

  const renderAwayIntervals = () => {
    // If student is excused or completely absent, they shouldn't show "remained present"
    if (effectiveStatus.text === "EXCUSED" || effectiveStatus.text === "ABSENT") {
        return (
            <View className="items-center py-4">
              <Ionicons name={effectiveStatus.icon as any} size={32} color={effectiveStatus.iconColor} />
              <Text style={{ color: effectiveStatus.iconColor }} className="mt-2 font-medium">
                {effectiveStatus.text === "EXCUSED" ? "Student was excused" : "Student is absent"}
              </Text>
              <Text className="text-gray-500 text-xs mt-1 text-center">
                No location data to analyze.
              </Text>
            </View>
        );
    }

    if (!student.away_analysis?.away_intervals || student.away_analysis.away_intervals.length === 0) {
      return (
        <View className="items-center py-4">
          <Ionicons name="checkmark-circle-outline" size={32} color="#10b981" />
          <Text className="text-green-600 mt-2 font-medium">
            Student remained present
          </Text>
          <Text className="text-gray-500 text-xs mt-1 text-center">
            Continuous connection maintained.
          </Text>
        </View>
      );
    }

    return student.away_analysis.away_intervals.map((interval, index) => {
      const startTime = new Date(interval.start);
      const endTime = new Date(interval.end);
      
      return (
        <View key={index} className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
          <View className="flex-row justify-between items-center mb-2">
            <View className="flex-row items-center">
              <Text className="text-amber-800 font-semibold ml-2">
                Away Period {index + 1}
              </Text>
            </View>
            <Text className="text-amber-600 font-bold">
              {interval.duration_minutes} mins
            </Text>
          </View>
          
          <View className="space-y-2">
            <View className="flex-row justify-between">
              <Text className="text-gray-600 text-xs">Start:</Text>
              <Text className="text-gray-900 text-xs font-medium">
                {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-600 text-xs">End:</Text>
              <Text className="text-gray-900 text-xs font-medium">
                {endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-600 text-xs">Reason:</Text>
              <Text className={`text-xs font-medium ${
                interval.reason === 'LOW_RSSI' ? 'text-amber-600' : 'text-orange-600'
              }`}>
                {interval.reason === 'LOW_RSSI' ? 'Weak Signal' : 'Not Detected'}
              </Text>
            </View>
          </View>
        </View>
      );
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center">
        {/* Background Overlay */}
        <Animated.View 
          style={{ opacity: fadeAnim }}
          className="absolute inset-0 bg-black/50"
        />
        
        {/* Modal Content */}
        <Animated.View 
          style={{
            transform: [{ scale: scaleAnim }],
            opacity: fadeAnim,
            maxHeight: '80%',
          }}
          className="bg-white rounded-2xl mx-6 w-11/12 shadow-xl"
        >
          {/* Header */}
          <View className="flex-row items-center justify-between p-4 border-b border-gray-200">
            <Text className="text-lg font-bold text-gray-900">
              Student Details
            </Text>
            <TouchableOpacity onPress={onClose} className="p-1">
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView className="p-4" showsVerticalScrollIndicator={false}>
            {/* Student Info Row */}
            <View className="flex-row mb-4">
              <View className="w-1/4 items-center pr-3">
                {student.image_link ? (
                  <Image
                    source={{ uri: student.image_link }}
                    className="w-16 h-16 rounded-full"
                    resizeMode="cover"
                  />
                ) : (
                  <View className="w-16 h-16 rounded-full bg-gray-300 items-center justify-center">
                    <Ionicons name="person" size={24} color="#6b7280" />
                  </View>
                )}
              </View>

              <View className="w-3/4 pl-3">
                <Text className="text-lg font-bold text-gray-900 mb-1">
                  {formatStudentName()}
                </Text>
                <Text className="text-gray-500 text-sm mb-2">
                  {student.user_id}
                </Text>

                <View className="flex-row flex-wrap">
                  <View className="w-1/2 mb-2">
                    <Text className="text-gray-600 text-xs">Program</Text>
                    <Text className="text-gray-900 font-medium text-sm">
                      {student.program || 'N/A'}
                    </Text>
                  </View>
                  <View className="w-1/2 mb-2">
                    <Text className="text-gray-600 text-xs">Year</Text>
                    <Text className="text-gray-900 font-medium text-sm">
                      {student.year || 'N/A'}
                    </Text>
                  </View>
                  <View className="w-1/2">
                    <Text className="text-gray-600 text-xs">Block</Text>
                    <Text className="text-gray-900 font-medium text-sm">
                      {student.block || 'N/A'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Attendance Status */}
            <View className={`rounded-xl p-3 mb-3 ${effectiveStatus.bgColor} border border-opacity-20 border-gray-200`}>
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-gray-600 font-medium">Status</Text>
                <View className="flex-row items-center">
                  <Ionicons 
                    name={effectiveStatus.icon as any} 
                    size={16} 
                    color={effectiveStatus.iconColor} 
                  />
                  <Text className={`ml-1 font-bold text-sm ${effectiveStatus.textColor}`}>
                    {effectiveStatus.text}
                  </Text>
                </View>
              </View>

              {/* Hide "Marked At" if they are excused to keep the UI clean */}
              {student.marked_at && !effectiveStatus.isExcused && (
                <View className="flex-row justify-between items-center">
                  <Text className="text-gray-600 font-medium">Marked At</Text>
                  <Text className="text-gray-900 font-medium text-sm">
                    {formatTime(student.marked_at)}
                  </Text>
                </View>
              )}
            </View>

  

            {/* Away Analysis Section */}
            <View className="bg-gray-50 rounded-xl p-3 mb-3">
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-gray-800 font-semibold">Away Analysis</Text>
                {student.away_analysis && !effectiveStatus.isExcused && (
                  <View className="flex-row items-center">
                    <Ionicons name="timer-outline" size={16} color="#3b82f6" />
                    <Text className="text-blue-600 font-medium text-xs ml-1">
                      {student.away_analysis.total_away_minutes || 0}m total away
                    </Text>
                  </View>
                )}
              </View>
              {renderAwayIntervals()}
            </View>

          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default StudentAttendanceModal;