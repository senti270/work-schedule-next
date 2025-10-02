const { initializeApp } = require('firebase/app');
const { getFirestore, doc, deleteDoc } = require('firebase/firestore');

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

async function deleteDuplicateSchedule() {
  try {
    console.log('🔥 중복 스케줄 삭제 시작...');
    
    // 김하연 중복 중 나중에 생성된 것 삭제 (rmwDp3E5l62eKGFCh5RW)
    const scheduleId = 'rmwDp3E5l62eKGFCh5RW';
    
    console.log(`📝 삭제할 스케줄 ID: ${scheduleId}`);
    console.log('   - 직원: 김하연');
    console.log('   - 날짜: 2025-09-11');
    console.log('   - 시간: 09:30 ~ 15:00 (휴게: 0.5)');
    
    await deleteDoc(doc(db, 'schedules', scheduleId));
    
    console.log('✅ 중복 스케줄 삭제 완료!');
    
  } catch (error) {
    console.error('❌ 중복 스케줄 삭제 실패:', error);
  }
}

deleteDuplicateSchedule();
