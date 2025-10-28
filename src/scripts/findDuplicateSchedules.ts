import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

interface Schedule {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  date: Date;
  startTime: string;
  endTime: string;
  breakTime: string;
  totalHours: number;
  originalInput?: string;
  createdAt: Date;
  updatedAt: Date;
}

const firebaseConfig = {
  apiKey: "AIzaSyBvOzQqJgQZJgQZJgQZJgQZJgQZJgQZJgQ",
  authDomain: "work-schedule-next.firebaseapp.com",
  projectId: "work-schedule-next",
  storageBucket: "work-schedule-next.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456789"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function findDuplicateSchedules() {
  try {
    console.log('🔥 박일심 중복 스케줄 찾기 시작...');
    
    const schedulesSnapshot = await getDocs(collection(db, 'schedules'));
    const allSchedules = schedulesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      date: doc.data().date?.toDate() || new Date()
    })) as Schedule[];

    // 박일심 스케줄 필터링
    const parkSchedules = allSchedules.filter(schedule => 
      schedule.employeeName === '박일심'
    );

    console.log(`🔥 박일심 전체 스케줄 개수: ${parkSchedules.length}`);

    // 날짜별로 그룹화
    const dateGroups = parkSchedules.reduce((acc, schedule) => {
      const dateKey = schedule.date.toISOString().split('T')[0];
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(schedule);
      return acc;
    }, {} as {[key: string]: Schedule[]});

    // 중복이 있는 날짜 찾기
    Object.entries(dateGroups).forEach(([date, schedules]) => {
      if (schedules.length > 1) {
        console.log(`\n🔥 ${date} 중복 스케줄 (${schedules.length}개):`);
        schedules.forEach((schedule, index) => {
          console.log(`  ${index + 1}. ID: ${schedule.id}`);
          console.log(`     지점: ${schedule.branchName} (${schedule.branchId})`);
          console.log(`     시간: ${schedule.startTime}-${schedule.endTime}(${schedule.breakTime})`);
          console.log(`     originalInput: ${schedule.originalInput || '없음'}`);
          console.log(`     생성일: ${schedule.createdAt.toISOString()}`);
          console.log(`     수정일: ${schedule.updatedAt.toISOString()}`);
          console.log('     ---');
        });
      }
    });

    // 10/31 특별 확인
    const oct31Schedules = parkSchedules.filter(schedule => {
      const dateStr = schedule.date.toISOString().split('T')[0];
      return dateStr === '2025-10-31';
    });

    if (oct31Schedules.length > 0) {
      console.log(`\n🔥 10/31 박일심 스케줄 (${oct31Schedules.length}개):`);
      oct31Schedules.forEach((schedule, index) => {
        console.log(`  ${index + 1}. ID: ${schedule.id}`);
        console.log(`     지점: ${schedule.branchName} (${schedule.branchId})`);
        console.log(`     시간: ${schedule.startTime}-${schedule.endTime}(${schedule.breakTime})`);
        console.log(`     originalInput: ${schedule.originalInput || '없음'}`);
        console.log(`     생성일: ${schedule.createdAt.toISOString()}`);
        console.log(`     수정일: ${schedule.updatedAt.toISOString()}`);
      });
    }

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

findDuplicateSchedules();
