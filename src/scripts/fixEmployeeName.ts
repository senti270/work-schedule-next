import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc, query, where } from 'firebase/firestore';

interface Schedule {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  date: unknown;
  startTime: string;
  endTime: string;
  breakTime: string;
  totalHours: number;
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

async function fixEmployeeName() {
  try {
    console.log('🔥 직원 이름 수정 시작...');
    
    // "유진"으로 저장된 스케줄 찾기
    const schedulesQuery = query(
      collection(db, 'schedules'),
      where('employeeName', '==', '유진')
    );
    
    const schedulesSnapshot = await getDocs(schedulesQuery);
    const schedules = schedulesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Schedule[];
    
    console.log(`🔥 "유진"으로 저장된 스케줄 개수: ${schedules.length}`);
    
    if (schedules.length > 0) {
      console.log('🔥 수정할 스케줄들:');
      schedules.forEach((schedule, index) => {
        console.log(`${index + 1}. ID: ${schedule.id}`);
        console.log(`   직원ID: ${schedule.employeeId}`);
        console.log(`   지점: ${schedule.branchName}`);
        console.log(`   날짜: ${schedule.date}`);
        console.log(`   시간: ${schedule.startTime}-${schedule.endTime}`);
        console.log('   ---');
      });
      
      // "유진"을 "유친"으로 수정
      for (const schedule of schedules) {
        await updateDoc(doc(db, 'schedules', schedule.id), {
          employeeName: '유친'
        });
        console.log(`✅ 수정 완료: ${schedule.id}`);
      }
      
      console.log(`\n🔥 총 ${schedules.length}개의 스케줄이 "유친"으로 수정되었습니다.`);
    } else {
      console.log('🔥 "유진"으로 저장된 스케줄이 없습니다.');
    }
    
    // "유친"으로 저장된 스케줄도 확인
    const uchinQuery = query(
      collection(db, 'schedules'),
      where('employeeName', '==', '유친')
    );
    
    const uchinSnapshot = await getDocs(uchinQuery);
    console.log(`🔥 "유친"으로 저장된 스케줄 개수: ${uchinSnapshot.docs.length}`);
    
  } catch (error) {
    console.error('오류 발생:', error);
  }
}

fixEmployeeName();
