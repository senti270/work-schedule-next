const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where, orderBy } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyBvOzrkgLq8Xj4QZqQZqQZqQZqQZqQZqQZq",
  authDomain: "workschedule-8fc6f.firebaseapp.com",
  projectId: "workschedule-8fc6f",
  storageBucket: "workschedule-8fc6f.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkKimYoojungDuplicates() {
  try {
    console.log('=== 김유정 중복 스케줄 확인 ===');
    
    // 김유정 직원 ID 찾기
    const employeesSnapshot = await getDocs(collection(db, 'employees'));
    let kimYoojungId = null;
    
    for (const doc of employeesSnapshot.docs) {
      const data = doc.data();
      if (data.name === '김유정') {
        kimYoojungId = doc.id;
        console.log('김유정 직원 ID:', kimYoojungId);
        break;
      }
    }
    
    if (!kimYoojungId) {
      console.log('김유정 직원을 찾을 수 없습니다.');
      return;
    }
    
    // 김유정의 9월 스케줄 조회
    const schedulesQuery = query(
      collection(db, 'schedules'),
      where('employeeId', '==', kimYoojungId),
      where('month', '==', '2025-09'),
      orderBy('date')
    );
    
    const schedulesSnapshot = await getDocs(schedulesQuery);
    console.log('김유정 9월 스케줄 총 개수:', schedulesSnapshot.docs.length);
    
    const schedules = [];
    schedulesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      schedules.push({
        id: doc.id,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        branchId: data.branchId,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : null
      });
    });
    
    // 날짜별로 그룹화하여 중복 확인
    const dateGroups = {};
    schedules.forEach(schedule => {
      const date = schedule.date;
      if (!dateGroups[date]) {
        dateGroups[date] = [];
      }
      dateGroups[date].push(schedule);
    });
    
    console.log('\n=== 날짜별 스케줄 분석 ===');
    Object.keys(dateGroups).forEach(date => {
      const daySchedules = dateGroups[date];
      console.log(`\n날짜: ${date} (${daySchedules.length}건)`);
      
      daySchedules.forEach((schedule, index) => {
        console.log(`  ${index + 1}. ID: ${schedule.id}`);
        console.log(`     시간: ${schedule.startTime} - ${schedule.endTime}`);
        console.log(`     지점: ${schedule.branchId}`);
        console.log(`     생성: ${schedule.createdAt}`);
        console.log(`     수정: ${schedule.updatedAt}`);
      });
      
      if (daySchedules.length > 1) {
        console.log(`  ⚠️  중복 발견: ${daySchedules.length}건`);
      }
    });
    
    // 중복이 있는 날짜들
    const duplicateDates = Object.keys(dateGroups).filter(date => dateGroups[date].length > 1);
    if (duplicateDates.length > 0) {
      console.log('\n=== 중복된 날짜들 ===');
      duplicateDates.forEach(date => {
        console.log(`${date}: ${dateGroups[date].length}건`);
      });
    } else {
      console.log('\n중복된 스케줄이 없습니다.');
    }
    
  } catch (error) {
    console.error('오류 발생:', error);
  }
}

checkKimYoojungDuplicates();
