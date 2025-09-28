const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where } = require('firebase/firestore');

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

async function checkKimYoojungAll() {
  try {
    console.log('=== 김유정 전체 스케줄 확인 ===');
    
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
    
    // 김유정의 모든 스케줄 조회
    const schedulesQuery = query(
      collection(db, 'schedules'),
      where('employeeId', '==', kimYoojungId)
    );
    
    const schedulesSnapshot = await getDocs(schedulesQuery);
    console.log('김유정 전체 스케줄 개수:', schedulesSnapshot.docs.length);
    
    const schedules = [];
    schedulesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      schedules.push({
        id: doc.id,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        branchId: data.branchId,
        month: data.month,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : null
      });
    });
    
    // 월별로 그룹화
    const monthGroups = {};
    schedules.forEach(schedule => {
      const month = schedule.month || 'month_unknown';
      if (!monthGroups[month]) {
        monthGroups[month] = [];
      }
      monthGroups[month].push(schedule);
    });
    
    console.log('\n=== 월별 스케줄 ===');
    Object.keys(monthGroups).sort().forEach(month => {
      const monthSchedules = monthGroups[month];
      console.log(`\n${month}: ${monthSchedules.length}건`);
      
      // 날짜별로 그룹화
      const dateGroups = {};
      monthSchedules.forEach(schedule => {
        const date = schedule.date;
        if (!dateGroups[date]) {
          dateGroups[date] = [];
        }
        dateGroups[date].push(schedule);
      });
      
      Object.keys(dateGroups).sort().forEach(date => {
        const daySchedules = dateGroups[date];
        console.log(`  ${date}: ${daySchedules.length}건`);
        
        daySchedules.forEach((schedule, index) => {
          console.log(`    ${index + 1}. ${schedule.startTime}-${schedule.endTime} (${schedule.branchId})`);
          console.log(`       ID: ${schedule.id}`);
          console.log(`       생성: ${schedule.createdAt}`);
        });
        
        if (daySchedules.length > 1) {
          console.log(`    ⚠️  중복 발견: ${daySchedules.length}건`);
        }
      });
    });
    
  } catch (error) {
    console.error('오류 발생:', error);
  }
}

checkKimYoojungAll();
