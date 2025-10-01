// 🔥 2-C: 간단한 클라이언트 캐싱 유틸리티 (React Query 대신)
// 메모리 기반 캐싱으로 같은 데이터 반복 조회 방지

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time To Live (ms)
}

class SimpleCache {
  private cache = new Map<string, CacheItem<unknown>>();
  
  // 캐시에 데이터 저장
  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void { // 기본 5분
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }
  
  // 캐시에서 데이터 조회
  get<T>(key: string): T | null {
    const item = this.cache.get(key) as CacheItem<T> | undefined;
    
    if (!item) {
      return null;
    }
    
    // TTL 체크
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }
  
  // 캐시 무효화
  invalidate(key: string): void {
    this.cache.delete(key);
  }
  
  // 특정 패턴의 키들 무효화
  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }
  
  // 전체 캐시 클리어
  clear(): void {
    this.cache.clear();
  }
  
  // 캐시 상태 확인
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// 전역 캐시 인스턴스
export const cache = new SimpleCache();

// 🔥 Firebase 쿼리 캐싱 래퍼
export const cachedQuery = async <T>(
  key: string,
  queryFn: () => Promise<T>,
  ttl?: number
): Promise<T> => {
  // 캐시에서 먼저 확인
  const cached = cache.get<T>(key);
  if (cached !== null) {
    console.log(`🔥 캐시 히트: ${key}`);
    return cached;
  }
  
  // 캐시에 없으면 쿼리 실행
  console.log(`🔥 캐시 미스: ${key}`);
  const data = await queryFn();
  
  // 결과를 캐시에 저장
  cache.set(key, data, ttl);
  
  return data;
};

// 🔥 자주 사용되는 캐시 키 생성기
export const getCacheKey = {
  employees: () => 'employees:all',
  employee: (id: string) => `employee:${id}`,
  branches: () => 'branches:all',
  branch: (id: string) => `branch:${id}`,
  schedules: (employeeId: string, month: string) => `schedules:${employeeId}:${month}`,
  reviewStatus: (employeeId: string, month: string) => `reviewStatus:${employeeId}:${month}`,
  monthlyStats: (employeeId: string, branchId: string, month: string) => 
    `monthlyStats:${employeeId}:${branchId}:${month}`,
  contracts: (employeeId: string) => `contracts:${employeeId}`,
};

// 🔥 관련 캐시 무효화 헬퍼
export const invalidateRelatedCache = {
  employee: (employeeId: string) => {
    cache.invalidatePattern(`employee:${employeeId}`);
    cache.invalidatePattern(`contracts:${employeeId}`);
    cache.invalidatePattern(`schedules:${employeeId}`);
    cache.invalidatePattern(`reviewStatus:${employeeId}`);
    cache.invalidatePattern(`monthlyStats:${employeeId}`);
  },
  schedules: (employeeId: string, month: string) => {
    cache.invalidate(getCacheKey.schedules(employeeId, month));
    cache.invalidate(getCacheKey.monthlyStats(employeeId, '*', month));
  },
  reviewStatus: (employeeId: string, month: string) => {
    cache.invalidate(getCacheKey.reviewStatus(employeeId, month));
  }
};
