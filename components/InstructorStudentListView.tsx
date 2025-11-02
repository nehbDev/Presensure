import React from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  SectionList,
  Image,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Student {
  user_id: string;
  firstname: string;
  lastname: string;
  middle_initial?: string;
  suffix?: string;
  sex: string;
  role: string;
  attendance_status?: string;
  marked_at?: string;
  image_link?: string;
}

interface InstructorStudentListViewProps {
  students: Student[];
  loading: boolean;
  sessionStatus: string;
  onRefresh: () => void;
  refreshing: boolean;
  onBackToBLE?: () => void;
}

interface SectionData {
  title: string;
  data: Student[];
}

const InstructorStudentListView: React.FC<InstructorStudentListViewProps> = ({
  students,
  loading,
  sessionStatus,
  onRefresh,
  refreshing,
  onBackToBLE,
}) => {
  // Remove the problematic comparisons and use simpler logic
  const formatStudentName = (student: Student) => {
    let name = `${student.lastname}, ${student.firstname}`;
    
    if (student.middle_initial) {
      name += ` ${student.middle_initial}.`;
    }
    
    if (student.suffix) {
      name += ` ${student.suffix}`;
    }
    
    return name;
  };

  const formatStudentDisplay = (student: Student) => {
    return `${formatStudentName(student)}`;
  };

  // Group students by gender and sort by lastname, firstname
  const getGroupedStudents = (): SectionData[] => {
    const sortStudents = (a: Student, b: Student) => {
      const nameA = `${a.lastname} ${a.firstname}`.toLowerCase();
      const nameB = `${b.lastname} ${b.firstname}`.toLowerCase();
      return nameA.localeCompare(nameB);
    };

    const maleStudents = students
      .filter(student => student.sex?.toLowerCase() === 'male')
      .sort(sortStudents);

    const femaleStudents = students
      .filter(student => student.sex?.toLowerCase() === 'female')
      .sort(sortStudents);

    const otherStudents = students
      .filter(student => !['male', 'female'].includes(student.sex?.toLowerCase()))
      .sort(sortStudents);

    const sections: SectionData[] = [];

    if (maleStudents.length > 0) {
      sections.push({
        title: 'MALE',
        data: maleStudents
      });
    }

    if (femaleStudents.length > 0) {
      sections.push({
        title: 'FEMALE',
        data: femaleStudents
      });
    }

    if (otherStudents.length > 0) {
      sections.push({
        title: 'OTHER',
        data: otherStudents
      });
    }

    return sections;
  };

  const StudentItem = ({ student }: { student: Student }) => (
    <View className="bg-white p-4 rounded-xl border border-gray-200 mb-3 mx-2">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center flex-1">
          <View className="mr-3">
            {student.image_link ? (
              <Image
                source={{ uri: student.image_link }}
                className="w-12 h-12 rounded-full"
                resizeMode="cover"
              />
            ) : (
              <View className="w-12 h-12 rounded-full bg-gray-300 items-center justify-center">
                <Ionicons name="person" size={24} color="#6b7280" />
              </View>
            )}
          </View>
          
          <View className="flex-1">
            <Text className="text-gray-900 font-medium text-base">
              {formatStudentDisplay(student)}
            </Text>
            <Text className="text-gray-500 text-xs mt-1">
            {student.user_id}
          </Text>
            {student.marked_at && (
              <Text className="text-gray-400 text-xs mt-1">
                Marked at: {new Date(student.marked_at).toLocaleTimeString()}
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );

  const SectionHeader = ({ title }: { title: string }) => (
  <View 
    className={`bg-white py-3 px-4 rounded-lg mb-3 mx-2 border-t-4 ${
      title === 'MALE' 
        ? 'border-t-green-500' 
        : title === 'FEMALE' 
        ? 'border-t-red-500' 
        : 'border-t-blue-500'
    }`}
  >
    <Text className="text-lg font-bold text-gray-800 uppercase">
      {title}
    </Text>
  </View>
);

  const groupedSections = getGroupedStudents();

  if (loading && students.length === 0) {
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-center text-gray-500 mt-4">Loading students...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Back to BLE Controls Button */}
      {onBackToBLE && (
        <View className="bg-white p-4 border-b border-gray-200">
          <TouchableOpacity
            onPress={onBackToBLE}
            className="flex-row items-center justify-center bg-blue-600 py-3 px-6 rounded-full"
          >
            <Ionicons name="arrow-back" size={20} color="white" />
            <Text className="text-white font-semibold ml-2 text-lg">
              Back to BLE Controls
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View className="flex-1 p-4">

        {groupedSections.length > 0 ? (
          <SectionList
            sections={groupedSections}
            keyExtractor={(item) => item.user_id}
            renderItem={({ item }) => <StudentItem student={item} />}
            renderSectionHeader={({ section }) => (
              <SectionHeader title={section.title} />
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={["#3b82f6"]}
                tintColor="#3b82f6"
              />
            }
            stickySectionHeadersEnabled={false}
            showsVerticalScrollIndicator={false}
            className="flex-1"
          />
        ) : (
          <View className="flex-1 justify-center items-center">
            <Ionicons name="people-outline" size={48} color="#d1d5db" />
            <Text className="text-gray-500 text-center mt-4">
              No students enrolled
            </Text>
            <Text className="text-gray-400 text-center mt-2">
              Students enrolled in this course will appear here
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default InstructorStudentListView;