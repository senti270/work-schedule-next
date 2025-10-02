const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, deleteDoc } = require('firebase/firestore');

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

async function checkAndDeleteWeeklyNote() {
  try {
    console.log('🔥 9월 1일 주간 주간비고 확인 시작...\n');
    
    const querySnapshot = await getDocs(collection(db, 'weeklyNotes'));
    
    // 9월 1일이 포함된 주간 찾기 (9/1 ~ 9/7)
    const targetWeekStart = new Date('2025-09-01');
    const targetWeekEnd = new Date('2025-09-07');
    
    console.log('찾는 주간:', targetWeekStart.toISOString().split('T')[0], '~', targetWeekEnd.toISOString().split('T')[0]);
    
    let foundNotes = [];
    
    querySnapshot.docs.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      const weekStart = data.weekStart?.toDate ? data.weekStart.toDate() : new Date(data.weekStart);
      const weekEnd = data.weekEnd?.toDate ? data.weekEnd.toDate() : new Date(data.weekEnd);
      
      // 날짜 비교 (시간 무시)
      const weekStartStr = weekStart.toISOString().split('T')[0];
      const weekEndStr = weekEnd.toISOString().split('T')[0];
      const targetStartStr = targetWeekStart.toISOString().split('T')[0];
      const targetEndStr = targetWeekEnd.toISOString().split('T')[0];
      
      // 석촌호수점(wd6Ni7j5dVth8qLG8C86) + 9/1-9/7 주간
      if (data.branchId === 'wd6Ni7j5dVth8qLG8C86' && 
          (weekStartStr === targetStartStr || weekEndStr === targetEndStr ||
           (weekStart >= targetWeekStart && weekStart <= targetWeekEnd))) {
        foundNotes.push({
          id: docSnapshot.id,
          branchId: data.branchId,
          weekStart: weekStartStr,
          weekEnd: weekEndStr,
          note: data.note,
          noteLength: data.note?.length || 0
        });
      }
    });
    
    console.log(`\n📊 발견된 주간비고: ${foundNotes.length}개\n`);
    
    if (foundNotes.length === 0) {
      console.log('❌ 해당 주간의 주간비고를 찾을 수 없습니다.');
      return;
    }
    
    foundNotes.forEach((note, index) => {
      console.log(`${index + 1}. 문서 ID: ${note.id}`);
      console.log(`   - 지점: ${note.branchId}`);
      console.log(`   - 주간: ${note.weekStart} ~ ${note.weekEnd}`);
      console.log(`   - 비고 길이: ${note.noteLength}자`);
      console.log(`   - 비고 미리보기: ${note.note?.substring(0, 100) || '없음'}\n`);
    });
    
    // 삭제 진행
    console.log('🗑️  주간비고 삭제 시작...\n');
    
    for (const note of foundNotes) {
      console.log(`삭제 중: ${note.id} (${note.weekStart} ~ ${note.weekEnd})`);
      await deleteDoc(doc(db, 'weeklyNotes', note.id));
      console.log(`✅ 삭제 완료\n`);
    }
    
    console.log(`🎉 총 ${foundNotes.length}개의 주간비고가 삭제되었습니다!`);
    
  } catch (error) {
    console.error('❌ 작업 실패:', error);
  }
}

checkAndDeleteWeeklyNote();
