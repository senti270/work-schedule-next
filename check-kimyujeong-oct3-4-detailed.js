const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

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

async function checkKimYujeongOct34() {
  try {
    console.log('🔥 김유정 10월 3-4일 스케줄 상세 확인...\n');
    
    const querySnapshot = await getDocs(collection(db, 'schedules'));
    
    const kimYujeongSchedules = [];
    querySnapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.employeeName === '김유정') {
        const date = data.date?.toDate ? data.date.toDate() : new Date(data.date);
        const dateString = date.toISOString().split('T')[0];
        
        // 10월 3일 또는 4일만
        if (dateString === '2025-10-03' || dateString === '2025-10-04') {
          kimYujeongSchedules.push({
            id: doc.id,
            employeeName: data.employeeName,
            branchName: data.branchName,
            branchId: data.branchId,
            date: dateString,
            dateObj: date,
            dateISO: date.toISOString(),
            dateString: date.toDateString(),
            dateLocal: date.toLocaleString('ko-KR'),
            startTime: data.startTime,
            endTime: data.endTime,
            breakTime: data.breakTime,
            totalHours: data.totalHours,
            createdAt: data.createdAt?.toDate?.() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
          });
        }
      }
    });
    
    kimYujeongSchedules.sort((a, b) => a.dateObj - b.dateObj);
    
    console.log(`📊 김유정 10월 3-4일 스케줄: ${kimYujeongSchedules.length}개\n`);
    
    kimYujeongSchedules.forEach((schedule, index) => {
      console.log(`\n${index + 1}. 문서 ID: ${schedule.id}`);
      console.log(`   📅 날짜 정보:`);
      console.log(`      - ISO String: ${schedule.dateISO}`);
      console.log(`      - Date String: ${schedule.dateString}`);
      console.log(`      - Local String: ${schedule.dateLocal}`);
      console.log(`      - YYYY-MM-DD: ${schedule.date}`);
      console.log(`   🏢 지점: ${schedule.branchName} (${schedule.branchId})`);
      console.log(`   ⏰ 시간: ${schedule.startTime} ~ ${schedule.endTime} (휴게: ${schedule.breakTime})`);
      console.log(`   ⏱️  총 시간: ${schedule.totalHours}시간`);
      console.log(`   📝 생성일: ${schedule.createdAt}`);
      console.log(`   🔄 수정일: ${schedule.updatedAt}`);
    });
    
    // 공유화면에서 사용하는 날짜 비교 시뮬레이션
    console.log(`\n\n🔍 공유화면 날짜 필터링 시뮬레이션:`);
    
    // 9/29 - 10/5 주간
    const weekStart = new Date('2025-09-29');
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    
    console.log(`   주간 범위: ${weekStart.toISOString()} ~ ${weekEnd.toISOString()}\n`);
    
    // 10월 4일 (토요일)
    const oct4 = new Date('2025-10-04');
    console.log(`   10월 4일 (토): ${oct4.toDateString()}\n`);
    
    kimYujeongSchedules.forEach((schedule) => {
      const matches = schedule.dateString === oct4.toDateString();
      console.log(`   스케줄 ${schedule.date} (${schedule.startTime}~${schedule.endTime}):`);
      console.log(`      - schedule.dateString: "${schedule.dateString}"`);
      console.log(`      - oct4.toDateString(): "${oct4.toDateString()}"`);
      console.log(`      - 매칭 여부: ${matches ? '✅ YES' : '❌ NO'}`);
    });
    
  } catch (error) {
    console.error('❌ 확인 실패:', error);
  }
}

checkKimYujeongOct34();
