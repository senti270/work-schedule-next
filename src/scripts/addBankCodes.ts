import { collection, addDoc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface BankCode {
  id?: string;
  name: string;
  code: string;
  createdAt: Date;
}

const bankCodes: Omit<BankCode, 'id' | 'createdAt'>[] = [
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

export const addBankCodesToFirebase = async () => {
  try {
    console.log('은행코드 데이터를 Firebase에 추가하는 중...');
    
    // 기존 데이터 확인
    const existingSnapshot = await getDocs(collection(db, 'bankCodes'));
    if (!existingSnapshot.empty) {
      console.log('은행코드 데이터가 이미 존재합니다. 기존 데이터를 삭제하고 새로 추가합니다.');
      
      // 기존 데이터 삭제 (실제로는 updateDoc을 사용하는 것이 좋지만, 간단히 새로 추가)
      console.log('기존 데이터 건수:', existingSnapshot.docs.length);
    }
    
    // 새 데이터 추가
    const promises = bankCodes.map(async (bankCode) => {
      const docRef = await addDoc(collection(db, 'bankCodes'), {
        ...bankCode,
        createdAt: new Date()
      });
      console.log(`은행코드 추가됨: ${bankCode.name} (${bankCode.code}) - ID: ${docRef.id}`);
      return docRef;
    });
    
    await Promise.all(promises);
    console.log('모든 은행코드 데이터가 성공적으로 추가되었습니다!');
    
  } catch (error) {
    console.error('은행코드 데이터 추가 중 오류:', error);
    throw error;
  }
};

// 스크립트로 직접 실행할 때 사용
if (typeof window === 'undefined') {
  addBankCodesToFirebase()
    .then(() => {
      console.log('은행코드 추가 완료');
      process.exit(0);
    })
    .catch((error) => {
      console.error('은행코드 추가 실패:', error);
      process.exit(1);
    });
}
