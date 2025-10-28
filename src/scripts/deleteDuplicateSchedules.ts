import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

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

async function deleteDuplicateSchedules() {
  try {
    console.log('🔥 박일심 중복 스케줄 삭제 시작...');
    
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

    // 날짜별로 그룹화
    const dateGroups = parkSchedules.reduce((acc, schedule) => {
      const dateKey = schedule.date.toISOString().split('T')[0];
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(schedule);
      return acc;
    }, {} as {[key: string]: Schedule[]});

    // 중복이 있는 날짜 처리
    for (const [date, schedules] of Object.entries(dateGroups)) {
      if (schedules.length > 1) {
        console.log(`\n🔥 ${date} 중복 스케줄 처리 (${schedules.length}개):`);
        
        // 생성일 기준으로 정렬 (오래된 것부터)
        const sortedSchedules = schedules.sort((a, b) => 
          a.createdAt.getTime() - b.createdAt.getTime()
        );
        
        // 가장 오래된 것만 남기고 나머지 삭제
        const keepSchedule = sortedSchedules[0];
        const deleteSchedules = sortedSchedules.slice(1);
        
        console.log(`  유지할 스케줄: ${keepSchedule.id} (${keepSchedule.createdAt.toISOString()})`);
        
        for (const schedule of deleteSchedules) {
          console.log(`  삭제할 스케줄: ${schedule.id} (${schedule.createdAt.toISOString()})`);
          await deleteDoc(doc(db, 'schedules', schedule.id));
          console.log(`  ✅ 삭제 완료: ${schedule.id}`);
        }
      }
    }

    console.log('\n🔥 중복 스케줄 삭제 완료!');

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

deleteDuplicateSchedules();
