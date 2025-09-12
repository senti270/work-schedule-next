import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';


const bankCodesData = [
  { name: '국민은행', code: '004' },
  { name: '신한은행', code: '088' },
  { name: '우리은행', code: '020' },
  { name: '하나은행', code: '081' },
  { name: '농협은행', code: '011' },
  { name: '기업은행', code: '003' },
  { name: '카카오뱅크', code: '090' },
  { name: '케이뱅크', code: '089' },
  { name: 'SC제일은행', code: '023' },
  { name: '한국씨티은행', code: '027' },
  { name: '부산은행', code: '032' },
  { name: '대구은행', code: '031' },
  { name: '경남은행', code: '039' },
  { name: '광주은행', code: '034' },
  { name: '전북은행', code: '037' },
  { name: '제주은행', code: '035' },
  { name: '수협은행', code: '007' },
  { name: '우체국', code: '071' },
  { name: '새마을금고', code: '045' },
  { name: '신협', code: '048' },
  { name: '산업은행', code: '002' },
  { name: '한국은행', code: '001' },
  { name: '저축은행중앙회', code: '050' },
  { name: 'HSBC은행', code: '054' },
  { name: '도이치은행', code: '055' }
];

export const initializeBankCodes = async () => {
  try {
    console.log('은행코드 초기화 시작...');
    
    // 기존 데이터 확인
    const existingSnapshot = await getDocs(collection(db, 'bankCodes'));
    console.log('기존 은행코드 개수:', existingSnapshot.docs.length);
    
    if (existingSnapshot.docs.length > 0) {
      console.log('기존 은행코드 데이터가 있습니다. 삭제 후 새로 추가합니다.');
      
      // 기존 데이터 삭제
      for (const docSnapshot of existingSnapshot.docs) {
        await deleteDoc(doc(db, 'bankCodes', docSnapshot.id));
      }
    }
    
    // 새 데이터 추가
    const promises = bankCodesData.map(async (bankCode) => {
      const docRef = await addDoc(collection(db, 'bankCodes'), {
        ...bankCode,
        createdAt: new Date()
      });
      console.log(`은행코드 추가됨: ${bankCode.name} (${bankCode.code}) - ID: ${docRef.id}`);
      return docRef;
    });
    
    await Promise.all(promises);
    console.log('모든 은행코드가 성공적으로 추가되었습니다!');
    
    // 추가된 데이터 확인
    const finalSnapshot = await getDocs(collection(db, 'bankCodes'));
    console.log('최종 은행코드 개수:', finalSnapshot.docs.length);
    
    return true;
  } catch (error) {
    console.error('은행코드 초기화 중 오류:', error);
    throw error;
  }
};

// 브라우저에서 직접 실행할 수 있도록 window 객체에 추가
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).initializeBankCodes = initializeBankCodes;
}
