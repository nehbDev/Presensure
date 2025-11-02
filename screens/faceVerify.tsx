import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  useWindowDimensions,
  Alert,
  ActivityIndicator,
} from "react-native";
import {
  Camera as VisionCamera,
  useCameraDevice,
  useCameraPermission,
  PhotoFile,
} from "react-native-vision-camera";
import {
  Camera,
  Face,
  FaceDetectionOptions,
} from "react-native-vision-camera-face-detector";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { Svg, Circle } from "react-native-svg";

type ChallengeType =
  | "turn_left"
  | "turn_right"
  | "smile"
  | "blink"
  | "look_up"
  | "look_down";

export default function FaceVerify({ route }: any) {
  const navigation = useNavigation();
  const { schedule, onVerificationSuccess } = route.params || {};
  const { hasPermission, requestPermission } = useCameraPermission();
  const { width, height } = useWindowDimensions();
  const device = useCameraDevice("front");
  const cameraRef = useRef<VisionCamera>(null);

  const [currentChallenge, setCurrentChallenge] = useState<ChallengeType | "none">("none");
  const [completedChallenges, setCompletedChallenges] = useState<ChallengeType[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [verificationAttempts, setVerificationAttempts] = useState(0);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [blinkCount, setBlinkCount] = useState(0);

  const maxAttempts = 3;
  const requiredChallenges = 3;
  const challengeTimeout = 5000; // 5 seconds

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastEyeStateRef = useRef<"open" | "closed">("open");
  const isVerificationActive = useRef(false);
  const availableChallengesRef = useRef<ChallengeType[]>([]);
  const challengeCompletedRef = useRef(false);
  const attemptsRef = useRef(0);
  const lastDetectionRef = useRef(0);

  const challenges: { type: ChallengeType; instruction: string }[] = [
    { type: "turn_left", instruction: "Turn head LEFT" },
    { type: "turn_right", instruction: "Turn head RIGHT" },
    { type: "smile", instruction: "SMILE" },
    { type: "blink", instruction: "BLINK 2 times" },
    { type: "look_up", instruction: "Look UP" },
    { type: "look_down", instruction: "Look DOWN" },
  ];

  // Request camera permission on mount
  useEffect(() => {
    const initCamera = async () => {
      if (!hasPermission) {
        await requestPermission();
      }
    };
    initCamera();
  }, [hasPermission, requestPermission]);

  // Initialize challenges when camera is ready
  useEffect(() => {
    if (hasPermission && device) {
      availableChallengesRef.current = [...challenges.map((c) => c.type)];
      startNewChallenge();
    }
  }, [hasPermission, device]);

  // Sync ref with state
  useEffect(() => {
    attemptsRef.current = verificationAttempts;
  }, [verificationAttempts]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setIsCameraActive(false);
    };
  }, []);

  const startNewChallenge = () => {    
    if (attemptsRef.current >= maxAttempts) {
      handleMaxAttemptsReached();
      return;
    }

    if (completedChallenges.length >= requiredChallenges) {
      setCurrentChallenge("none");
      handleVerificationComplete();
      return;
    }

    if (availableChallengesRef.current.length === 0) {
      availableChallengesRef.current = [...challenges.map((c) => c.type)];
    }

    const randomIndex = Math.floor(Math.random() * availableChallengesRef.current.length);
    const selectedChallengeType = availableChallengesRef.current[randomIndex];
    
    setCurrentChallenge(selectedChallengeType);
    setBlinkCount(0);
    lastEyeStateRef.current = "open";
    challengeCompletedRef.current = false;

    // Clear existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Set timeout for challenge
    timerRef.current = setTimeout(() => {
      handleChallengeFailed();
    }, challengeTimeout);
  };

  const handleChallengeFailed = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    resetChallenges();
  };

  const handleChallengeSuccess = () => {
    if (challengeCompletedRef.current || currentChallenge === "none") {
      return;
    }

    challengeCompletedRef.current = true;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Remove completed challenge from available ones
    availableChallengesRef.current = availableChallengesRef.current.filter(
      (type) => type !== currentChallenge
    );

    setCompletedChallenges((prevCompleted) => {
      const newCompleted = [...prevCompleted, currentChallenge];
      
      // Start next challenge after a short delay
      setTimeout(() => {
        startNewChallenge();
      }, 1000);
      
      return newCompleted;
    });
  };

  const resetChallenges = () => {
    setCompletedChallenges([]);
    setCurrentChallenge("none");
    availableChallengesRef.current = [...challenges.map((c) => c.type)];
    
    setTimeout(() => {
      startNewChallenge();
    }, 1000);
  };

  const checkChallenge = (face: Face) => {
    if (currentChallenge === "none" || isProcessing || challengeCompletedRef.current) {
      return;
    }
    switch (currentChallenge) {
      case "turn_left":
        if (face.yawAngle > 20) {
          handleChallengeSuccess();
        }
        break;
      case "turn_right":
        if (face.yawAngle < -20) {
          handleChallengeSuccess();
        }
        break;
      case "smile":
        if (face.smilingProbability !== undefined && face.smilingProbability > 0.8) {
          handleChallengeSuccess();
        }
        break;
      case "blink":
        const leftEyeClosed = face.leftEyeOpenProbability < 0.3;
        const rightEyeClosed = face.rightEyeOpenProbability < 0.3;
        const bothEyesClosed = leftEyeClosed && rightEyeClosed;
        const bothEyesOpen = face.leftEyeOpenProbability > 0.7 && face.rightEyeOpenProbability > 0.7;

        if (bothEyesClosed && lastEyeStateRef.current === "open") {
          const newBlinkCount = blinkCount + 1;
          setBlinkCount(newBlinkCount);
          
          if (newBlinkCount >= 2) {
            handleChallengeSuccess();
          }
        }

        lastEyeStateRef.current = bothEyesOpen ? "open" : "closed";
        break;
      case "look_up":
        if (face.pitchAngle > 20) {
          handleChallengeSuccess();
        }
        break;
      case "look_down":
        if (face.pitchAngle < -15) {
          handleChallengeSuccess();
        }
        break;
    }
  };

  const handleFacesDetection = (faces: Face[]) => {
    const now = Date.now();
    // Reduce throttling to allow more frequent detection
    if (now - lastDetectionRef.current < 200) return;
    lastDetectionRef.current = now;

    if (faces.length > 0 && !isProcessing && currentChallenge !== "none") {
      checkChallenge(faces[0]);
    } else if (faces.length === 0) {
    }
  };

  const captureImage = async (): Promise<string | null> => {
    try {
      if (!cameraRef.current) {
        return null;
      }
      
      const photo: PhotoFile = await cameraRef.current.takePhoto({
        flash: 'off',
        enableShutterSound: false,
      });
      
      return `file://${photo.path}`;
    } catch (error) {
      console.error("Error capturing image:", error);
      return null;
    }
  };

  const verifyFaces = async (capturedImage: string): Promise<boolean> => {
    try {
      
      const userData = await AsyncStorage.getItem("user");
      if (!userData) {
        throw new Error("User data not found");
      }

      const user = JSON.parse(userData);
      if (!user.image_link) {
        throw new Error("Reference image not found");
      }

      const response = await fetch(capturedImage);
      const blob = await response.blob();

      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64data = reader.result as string;
            const payload = {
              reference_image: user.image_link,
              captured_image: base64data.split(',')[1], // Remove data URL prefix
            };
            
            const apiResponse = await fetch("http://192.168.1.15:5000/python/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (!apiResponse.ok) {
              resolve(false);
              return;
            }

            const result = await apiResponse.json();
            
            resolve(result.success && result.result?.verified);
          } catch (error) {
            console.error("Error in verification:", error);
            resolve(false);
          }
        };
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("Error in verifyFaces:", error);
      return false;
    }
  };

  const handleVerificationComplete = async () => {
    if (isVerificationActive.current || attemptsRef.current >= maxAttempts) {
      return;
    }

    isVerificationActive.current = true;
    setIsProcessing(true);

    try {
      const capturedImage = await captureImage();

      if (capturedImage) {
        const isVerified = await verifyFaces(capturedImage);
        setVerificationAttempts((prevAttempts) => {
          const newAttempts = prevAttempts + 1;

          if (isVerified) {
            if (onVerificationSuccess) {
              onVerificationSuccess(true);
            }
            Alert.alert("Success", "Face verification successful!", [
              {
                text: "OK",
                onPress: () => navigation.goBack()
              },
            ]);
          } else if (newAttempts >= maxAttempts) {
            handleMaxAttemptsReached();
          } else {
            Alert.alert("Failed", `Attempt ${newAttempts}/${maxAttempts}. Please try again.`);
            resetChallenges();
          }
          return newAttempts;
        });
      } else {
        handleVerificationError();
      }
    } catch (error) {
      handleVerificationError();
    } finally {
      setIsProcessing(false);
      isVerificationActive.current = false;
      setIsCameraActive(true);
    }
  };

  const handleVerificationError = () => {
    setVerificationAttempts((prevAttempts) => {
      const newAttempts = prevAttempts + 1;

      if (newAttempts >= maxAttempts) {
        handleMaxAttemptsReached();
      } else {
        Alert.alert("Error", `Attempt ${newAttempts}/${maxAttempts}. Please try again.`);
        resetChallenges();
      }
      return newAttempts;
    });
  };

  const handleMaxAttemptsReached = () => {
    if (onVerificationSuccess) {
      onVerificationSuccess(false);
    }
    Alert.alert("Maximum Attempts", "Verification failed after 3 attempts.", [
      {
        text: "OK",
        onPress: () => navigation.goBack()
      },
    ]);
  };

  const getChallengeIcon = (type: ChallengeType) => {
    const icons = {
      turn_left: "👈",
      turn_right: "👉",
      smile: "😊",
      blink: "😉",
      look_up: "👆",
      look_down: "👇",
    };
    return icons[type];
  };

  if (verificationAttempts >= maxAttempts) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.message}>Maximum attempts reached</Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.message}>Camera permission required</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.message}>Front camera not available</Text>
      </View>
    );
  }

  const progress = (completedChallenges.length / requiredChallenges) * 100;
  const currentChallengeData = challenges.find((c) => c.type === currentChallenge);

  // Circular progress bar calculations
  const OVAL_WIDTH = 320;
  const OVAL_HEIGHT = 400;
  const ovalCenterX = (width - OVAL_WIDTH) / 2;
  const ovalCenterY = (height - OVAL_HEIGHT) / 2;

  const radius = 160;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <View style={styles.container}>
      {isCameraActive && (
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isCameraActive}
          photo={true}
          faceDetectionCallback={handleFacesDetection}
          faceDetectionOptions={{
            performanceMode: "fast",
            classificationMode: "all",
            trackingEnabled: true,
          }}
        />
      )}

      <View style={styles.overlay}>
        {/* Clear inner area - Cutout */}
        <View
          style={[
            styles.clearArea,
            {
              width: OVAL_WIDTH - 16,
              height: OVAL_HEIGHT - 16,
              left: ovalCenterX + 8,
              top: ovalCenterY + 8,
              borderRadius: (OVAL_HEIGHT - 16) / 2,
            },
          ]}
        />

        {/* Circular Progress Bar */}
        <View
          style={[
            styles.circularProgressContainer,
            {
              left: ovalCenterX,
              top: ovalCenterY,
              width: OVAL_WIDTH,
              height: OVAL_HEIGHT,
            },
          ]}
        >
          <Svg width={OVAL_WIDTH} height={OVAL_HEIGHT}>
            <Circle
              cx={OVAL_WIDTH / 2}
              cy={OVAL_HEIGHT / 2}
              r={radius}
              stroke="#FFFFFF"
              strokeWidth={8}
              fill="transparent"
            />
            <Circle
              cx={OVAL_WIDTH / 2}
              cy={OVAL_HEIGHT / 2}
              r={radius}
              stroke="#10B981"
              strokeWidth={8}
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${OVAL_WIDTH / 2} ${OVAL_HEIGHT / 2})`}
            />
          </Svg>
        </View>

        {/* Challenge Instruction */}
        {!isProcessing && currentChallengeData && (
          <View style={styles.challengeInstruction}>
            <Text style={styles.challengeIcon}>
              {getChallengeIcon(currentChallengeData.type)}
            </Text>
            <Text style={styles.challengeText}>
              {currentChallengeData.instruction}
            </Text>
            {currentChallenge === "blink" && (
              <Text style={styles.blinkCount}>
                Blinks: {blinkCount}/2
              </Text>
            )}
          </View>
        )}

        {/* Processing Text */}
        {isProcessing && (
          <View style={styles.processingContainer}>
            <Text style={styles.processingText}>Verifying...</Text>
          </View>
        )}

        {/* Attempts Counter */}
        <View style={styles.attemptsContainer}>
          <Text style={styles.attemptsText}>
            Attempt {verificationAttempts + 1}/{maxAttempts}
          </Text>
        </View>

        {/* Debug Info */}
        <View style={styles.debugContainer}>
          <Text style={styles.debugText}>
            Challenges: {completedChallenges.length}/{requiredChallenges}
          </Text>
        </View>
      </View>

      {isProcessing && (
        <View style={styles.fullScreenOverlay}>
          <View style={styles.loaderContainer}>
            <ActivityIndicator
              size="large"
              color="#10B981"
              style={{ marginBottom: 12 }}
            />
            <Text style={styles.loaderText}>Verifying Face...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  message: {
    fontSize: 18,
    textAlign: "center",
    color: "#333",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  clearArea: {
    position: "absolute",
    backgroundColor: "transparent",
  },
  circularProgressContainer: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  challengeInstruction: {
    position: "absolute",
    top: 100,
    left: 0,
    right: 0,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  challengeIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  challengeText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 10,
  },
  blinkCount: {
    fontSize: 18,
    color: "#FFFFFF",
    textAlign: "center",
    marginTop: 8,
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 10,
  },
  processingContainer: {
    position: "absolute",
    top: 100,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  processingText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 10,
  },
  attemptsContainer: {
    position: "absolute",
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  attemptsText: {
    fontSize: 18,
    color: "#FFFFFF",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 10,
  },
  debugContainer: {
    position: "absolute",
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  debugText: {
    fontSize: 14,
    color: "#FFFFFF",
    textAlign: "center",
    opacity: 0.7,
  },
  fullScreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  loaderContainer: {
    padding: 24,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
    alignItems: "center",
  },
  loaderText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "600",
  },
});