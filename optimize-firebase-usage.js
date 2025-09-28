const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, deleteDoc, doc, query, where, orderBy, limit } = require('firebase/firestore');

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

async function optimizeFirebaseUsage() {
  try {
    console.log('=== Firebase 사용량 최적화 시작 ===');
    
    // 1. 오래된 스케줄 데이터 삭제 (3개월 이전)
    console.log('\n1. 오래된 스케줄 데이터 정리...');
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    const oldSchedulesQuery = query(
      collection(db, 'schedules'),
      where('createdAt', '<', threeMonthsAgo)
    );
    
    const oldSchedules = await getDocs(oldSchedulesQuery);
    console.log(`삭제할 오래된 스케줄: ${oldSchedules.docs.length}개`);
    
    for (const schedule of oldSchedules.docs) {
      await deleteDoc(doc(db, 'schedules', schedule.id));
    }
    
    // 2. 중복 스케줄 데이터 정리
    console.log('\n2. 중복 스케줄 데이터 정리...');
    const allSchedules = await getDocs(collection(db, 'schedules'));
    const scheduleMap = new Map();
    let duplicateCount = 0;
    
    allSchedules.docs.forEach(doc => {
      const data = doc.data();
      const key = `${data.employeeId}-${data.date.toDate().toISOString().split('T')[0]}`;
      
      if (scheduleMap.has(key)) {
        // 중복 발견, 나중에 생성된 것만 유지
        const existing = scheduleMap.get(key);
        const existingTime = existing.createdAt?.toDate ? existing.createdAt.toDate() : new Date(0);
        const currentTime = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(0);
        
        if (currentTime > existingTime) {
          // 현재 것이 더 최신이면 기존 것 삭제
          deleteDoc(doc(db, 'schedules', existing.id));
          scheduleMap.set(key, { id: doc.id, ...data });
          duplicateCount++;
        } else {
          // 기존 것이 더 최신이면 현재 것 삭제
          deleteDoc(doc(db, 'schedules', doc.id));
          duplicateCount++;
        }
      } else {
        scheduleMap.set(key, { id: doc.id, ...data });
      }
    });
    
    console.log(`중복 스케줄 삭제: ${duplicateCount}개`);
    
    // 3. 오래된 로그 데이터 정리 (예: 1개월 이전)
    console.log('\n3. 오래된 로그 데이터 정리...');
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    // actualWorkRecords에서 오래된 데이터 삭제
    const oldWorkRecordsQuery = query(
      collection(db, 'actualWorkRecords'),
      where('createdAt', '<', oneMonthAgo)
    );
    
    const oldWorkRecords = await getDocs(oldWorkRecordsQuery);
    console.log(`삭제할 오래된 근무기록: ${oldWorkRecords.docs.length}개`);
    
    for (const record of oldWorkRecords.docs) {
      await deleteDoc(doc(db, 'actualWorkRecords', record.id));
    }
    
    console.log('\n=== 최적화 완료 ===');
    console.log(`- 오래된 스케줄 삭제: ${oldSchedules.docs.length}개`);
    console.log(`- 중복 스케줄 삭제: ${duplicateCount}개`);
    console.log(`- 오래된 근무기록 삭제: ${oldWorkRecords.docs.length}개`);
    
  } catch (error) {
    console.error('최적화 중 오류:', error);
  }
}

optimizeFirebaseUsage();
