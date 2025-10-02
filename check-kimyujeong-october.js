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

async function checkKimYujeongOctober() {
  try {
    console.log('🔥 김유정 10월 스케줄 확인 시작...');
    
    // 모든 스케줄 가져오기
    const querySnapshot = await getDocs(collection(db, 'schedules'));
    console.log(`📊 전체 스케줄: ${querySnapshot.docs.length}개`);
    
    // 김유정 찾기
    const kimYujeongSchedules = [];
    querySnapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.employeeName === '김유정') {
        const date = data.date?.toDate ? data.date.toDate() : new Date(data.date);
        const dateString = date.toISOString().split('T')[0];
        
        kimYujeongSchedules.push({
          id: doc.id,
          employeeName: data.employeeName,
          branchName: data.branchName,
          date: dateString,
          dateObj: date,
          startTime: data.startTime,
          endTime: data.endTime,
          breakTime: data.breakTime,
          totalHours: data.totalHours,
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
        });
      }
    });
    
    console.log(`\n📊 김유정 전체 스케줄: ${kimYujeongSchedules.length}개`);
    
    // 10월 스케줄 필터링
    const octoberSchedules = kimYujeongSchedules.filter(s => 
      s.date.startsWith('2025-10')
    );
    
    console.log(`\n📅 김유정 10월 스케줄: ${octoberSchedules.length}개\n`);
    
    // 날짜별로 정렬
    octoberSchedules.sort((a, b) => a.dateObj - b.dateObj);
    
    // 10월 4일 스케줄 찾기
    const oct4Schedules = octoberSchedules.filter(s => s.date === '2025-10-04');
    
    if (oct4Schedules.length > 0) {
      console.log(`\n🔍 10월 4일 스케줄: ${oct4Schedules.length}개 발견\n`);
      oct4Schedules.forEach((schedule, index) => {
        console.log(`${index + 1}. 문서 ID: ${schedule.id}`);
        console.log(`   - 지점: ${schedule.branchName}`);
        console.log(`   - 시간: ${schedule.startTime} ~ ${schedule.endTime} (휴게: ${schedule.breakTime})`);
        console.log(`   - 총 시간: ${schedule.totalHours}시간`);
        console.log(`   - 생성일: ${schedule.createdAt}`);
        console.log(`   - 수정일: ${schedule.updatedAt}\n`);
      });
      
      if (oct4Schedules.length > 1) {
        console.log('⚠️  10월 4일에 중복 스케줄이 있습니다!');
      }
    } else {
      console.log('❌ 10월 4일 스케줄을 찾을 수 없습니다.');
    }
    
    // 전체 10월 스케줄 출력
    console.log('\n📅 김유정 전체 10월 스케줄:\n');
    octoberSchedules.forEach((schedule) => {
      console.log(`- ${schedule.date} (${schedule.branchName}): ${schedule.startTime}~${schedule.endTime} (${schedule.breakTime})`);
    });
    
  } catch (error) {
    console.error('❌ 김유정 10월 스케줄 확인 실패:', error);
  }
}

checkKimYujeongOctober();
