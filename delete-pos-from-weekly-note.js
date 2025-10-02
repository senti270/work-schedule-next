const { initializeApp } = require('firebase/app');
const { getFirestore, doc, updateDoc } = require('firebase/firestore');

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

async function deletePosDataFromWeeklyNote() {
  try {
    console.log('🔥 weeklyNotes에서 POS 데이터 삭제 시작...');
    
    // 문서 ID: TR0EEOgbJOWf0FLyrw1J
    const noteId = 'TR0EEOgbJOWf0FLyrw1J';
    
    console.log(`📝 업데이트할 문서 ID: ${noteId}`);
    console.log('   - 지점: 카페드로잉 석촌호수점');
    console.log('   - 주간: 2025-09-29 ~ 2025-10-05');
    console.log('   - 작업: POS 데이터를 빈 문자열로 변경');
    
    // note를 빈 문자열로 업데이트
    await updateDoc(doc(db, 'weeklyNotes', noteId), {
      note: '',
      updatedAt: new Date()
    });
    
    console.log('✅ POS 데이터 삭제 완료!');
    console.log('📝 주간 비고가 빈 문자열로 변경되었습니다.');
    
  } catch (error) {
    console.error('❌ POS 데이터 삭제 실패:', error);
  }
}

deletePosDataFromWeeklyNote();
