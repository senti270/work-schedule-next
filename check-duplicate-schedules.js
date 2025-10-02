const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where } = require('firebase/firestore');

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyCahLcE9AibVxzwYX8xqDr_SzTP3-vhtjo",
  authDomain: "workschedule-8fc6f.firebaseapp.com",
  projectId: "workschedule-8fc6f",
  storageBucket: "workschedule-8fc6f.firebasestorage.app",
  messagingSenderId: "860832451",
  appId: "1:860832451:web:21754e4c80bcc6f752d6fe",
  measurementId: "G-FE573RCHWZ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkDuplicateSchedules() {
  try {
    console.log('🔥 중복 스케줄 확인 시작...');
    
    // 모든 스케줄 가져오기
    const querySnapshot = await getDocs(collection(db, 'schedules'));
    console.log(`📊 스케줄 총 ${querySnapshot.docs.length}개 문서`);
    
    // 직원별, 날짜별로 그룹화
    const scheduleMap = new Map();
    
    querySnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const date = data.date?.toDate ? data.date.toDate() : new Date(data.date);
      const dateString = date.toISOString().split('T')[0];
      const key = `${data.employeeId}-${data.branchId}-${dateString}`;
      
      if (!scheduleMap.has(key)) {
        scheduleMap.set(key, []);
      }
      
      scheduleMap.get(key).push({
        id: doc.id,
        employeeName: data.employeeName,
        branchName: data.branchName,
        date: dateString,
        startTime: data.startTime,
        endTime: data.endTime,
        breakTime: data.breakTime,
        totalHours: data.totalHours,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
      });
    });
    
    // 중복 찾기
    let duplicateCount = 0;
    console.log('\n🔍 중복 스케줄 검색 결과:');
    
    scheduleMap.forEach((schedules, key) => {
      if (schedules.length > 1) {
        duplicateCount++;
        console.log(`\n⚠️  중복 발견 #${duplicateCount}:`);
        console.log(`   키: ${key}`);
        schedules.forEach((schedule, index) => {
          console.log(`   ${index + 1}. ${schedule.employeeName} (${schedule.branchName})`);
          console.log(`      날짜: ${schedule.date}`);
          console.log(`      시간: ${schedule.startTime} ~ ${schedule.endTime} (휴게: ${schedule.breakTime})`);
          console.log(`      총 시간: ${schedule.totalHours}시간`);
          console.log(`      문서 ID: ${schedule.id}`);
          console.log(`      생성일: ${schedule.createdAt}`);
          console.log(`      수정일: ${schedule.updatedAt}`);
        });
      }
    });
    
    if (duplicateCount === 0) {
      console.log('\n✅ 중복 스케줄이 없습니다!');
    } else {
      console.log(`\n📊 총 ${duplicateCount}개의 중복 그룹 발견`);
    }
    
  } catch (error) {
    console.error('❌ 중복 스케줄 확인 실패:', error);
  }
}

checkDuplicateSchedules();
