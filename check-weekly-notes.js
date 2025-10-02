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

async function checkWeeklyNotes() {
  try {
    console.log('🔥 weeklyNotes 컬렉션 확인 시작...');
    
    const querySnapshot = await getDocs(collection(db, 'weeklyNotes'));
    console.log(`📊 weeklyNotes 총 ${querySnapshot.docs.length}개 문서 발견`);
    
    querySnapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`\n📝 문서 ${index + 1} (ID: ${doc.id}):`);
      console.log('  - branchId:', data.branchId);
      console.log('  - weekStart:', data.weekStart?.toDate?.() || data.weekStart);
      console.log('  - weekEnd:', data.weekEnd?.toDate?.() || data.weekEnd);
      console.log('  - note 길이:', data.note?.length || 0);
      console.log('  - note 미리보기:', data.note?.substring(0, 100) || '없음');
      
      // POS 데이터 패턴 확인
      if (data.note && data.note.includes('POS 입력-')) {
        console.log('  ⚠️  POS 데이터 발견!');
      }
    });
    
  } catch (error) {
    console.error('❌ weeklyNotes 확인 실패:', error);
  }
}

checkWeeklyNotes();
