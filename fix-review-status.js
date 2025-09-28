const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where, deleteDoc, doc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyBqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJ",
  authDomain: "work-schedule-next.firebaseapp.com",
  projectId: "work-schedule-next",
  storageBucket: "work-schedule-next.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdefghijklmnop"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixReviewStatus() {
  try {
    console.log('김유정과 박유진의 잘못된 검토 상태 데이터 확인 중...');
    
    // 김유정과 박유진의 employeeId 찾기
    const employeesSnapshot = await getDocs(collection(db, 'employees'));
    const kimYujin = employeesSnapshot.docs.find(doc => {
      const data = doc.data();
      return data.name && data.name.includes('김유정');
    });
    const parkYujin = employeesSnapshot.docs.find(doc => {
      const data = doc.data();
      return data.name && data.name.includes('박유진');
    });
    
    if (kimYujin) {
      console.log('김유정 직원 ID:', kimYujin.id);
      
      // 김유정의 9월 검토 상태 데이터 확인 및 삭제
      const reviewStatusQuery = query(
        collection(db, 'employeeReviewStatus'),
        where('employeeId', '==', kimYujin.id),
        where('month', '==', '2024-09')
      );
      const reviewStatusSnapshot = await getDocs(reviewStatusQuery);
      
      console.log('김유정의 9월 검토 상태 데이터:', reviewStatusSnapshot.docs.map(doc => doc.data()));
      
      // 잘못된 상태 데이터 삭제
      for (const docSnapshot of reviewStatusSnapshot.docs) {
        console.log('김유정의 잘못된 검토 상태 데이터 삭제:', docSnapshot.id);
        await deleteDoc(doc(db, 'employeeReviewStatus', docSnapshot.id));
      }
    }
    
    if (parkYujin) {
      console.log('박유진 직원 ID:', parkYujin.id);
      
      // 박유진의 9월 검토 상태 데이터 확인 및 삭제
      const reviewStatusQuery = query(
        collection(db, 'employeeReviewStatus'),
        where('employeeId', '==', parkYujin.id),
        where('month', '==', '2024-09')
      );
      const reviewStatusSnapshot = await getDocs(reviewStatusQuery);
      
      console.log('박유진의 9월 검토 상태 데이터:', reviewStatusSnapshot.docs.map(doc => doc.data()));
      
      // 잘못된 상태 데이터 삭제
      for (const docSnapshot of reviewStatusSnapshot.docs) {
        console.log('박유진의 잘못된 검토 상태 데이터 삭제:', docSnapshot.id);
        await deleteDoc(doc(db, 'employeeReviewStatus', docSnapshot.id));
      }
    }
    
    console.log('검토 상태 데이터 정리 완료!');
    
  } catch (error) {
    console.error('에러 발생:', error);
  }
}

fixReviewStatus();
