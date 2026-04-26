// types/index.ts

export interface Schedule {
  schedule_id: number;
  subject_code: string;
  subject_description: string;
  room: string;
  days: string;
  start_time: string;
  end_time: string;
  schedule_type: string;
  instructor_name?: string;
}

export interface Student {
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
  program?: string;
  year?: string;
  block?: string;
}

export type RootStackParamList = {
  LoginScreen: undefined;
  HomeScreen: undefined;
  ViewScheduleScreen: {
    schedule: Schedule;
  };
  FaceVerify: {
    schedule: Schedule;
    onVerificationSuccess: (verificationResult: boolean) => Promise<void>;
  };
};