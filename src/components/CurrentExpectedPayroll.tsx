'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PayrollCalculator } from '@/utils/PayrollCalculator';

type EmploymentType = '근로소득' | '사업소득' | '외국인' | '일용직' | string;

interface EmployeeDoc {
  id: string;
  name: string;
  employmentType?: EmploymentType;
  contractType?: EmploymentType; // 폴백
  salaryType?: 'hourly' | 'monthly' | '시급' | '월급' | string;
  salaryAmount?: number;
  salary?: number; // 폴백
  weeklyWorkHours?: number;
  includesWeeklyHolidayInWage?: boolean;
}

interface ScheduleDoc {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId?: string;
  branchName?: string;
  date?: string; // YYYY-MM-DD
  startTime?: string;
  endTime?: string;
  breakTime?: number;
  totalHours?: number;
  actualHours?: number;
  workHours?: number;
}

interface EmploymentContractDoc {
  id: string;
  employeeId: string;
  startDate?: any; // Firestore Timestamp | string
  employmentType?: EmploymentType;
  salaryType?: 'hourly' | 'monthly' | '시급' | '월급' | string;
  salaryAmount?: number;
  weeklyWorkHours?: number;
  includeHolidayAllowance?: boolean;
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeMonth(value: string) {
  if (!value) return value;
  const m = String(value).match(/^(\d{4})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  return value;
}

// 고용형태는 저장된 값을 그대로 사용 (매핑/정규화 없음)

function toDateSafe(d: any): Date | undefined {
  if (!d) return undefined;
  if (d instanceof Date) return d;
  if (typeof d === 'string') return new Date(d);
  if (typeof d === 'object' && typeof d.toDate === 'function') return d.toDate();
  return undefined;
}

function getMonthKeyFromAny(d: any): string | undefined {
  const date = toDateSafe(d);
  if (!date) return undefined;
  return getMonthKey(date);
}

function parseTimeToHours(time: string | undefined): number | undefined {
  if (!time || typeof time !== 'string') return undefined;
  const m = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  return h + min / 60;
}

function calcHoursFromTimes(start?: string, end?: string, breakTime?: number): number | undefined {
  const s = parseTimeToHours(start);
  const e = parseTimeToHours(end);
  if (s === undefined || e === undefined) return undefined;
  const br = Number(breakTime || 0);
  const diff = e - s - br;
  return diff >= 0 ? diff : 0;
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

const CurrentExpectedPayroll: React.FC = () => {
  const [targetDate, setTargetDate] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [employees, setEmployees] = useState<EmployeeDoc[]>([]);
  const [schedules, setSchedules] = useState<ScheduleDoc[]>([]);
  const [contracts, setContracts] = useState<EmploymentContractDoc[]>([]);
  const [loading, setLoading] = useState(false);

  const selectedDateObj = useMemo(() => new Date(targetDate), [targetDate]);
  const selectedDateOnly = useMemo(() => (
    new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate())
  ), [selectedDateObj]);
  const selectedMonthKey = useMemo(() => getMonthKey(selectedDateObj), [selectedDateObj]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const empSnap = await getDocs(collection(db, 'employees'));
        const empData = empSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as EmployeeDoc[];
        setEmployees(empData);

        // 계약서 로드
        const contractsSnap = await getDocs(collection(db, 'employmentContracts'));
        const allContracts = contractsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as EmploymentContractDoc[];
        setContracts(allContracts);

        // 스케줄 컬렉션에서 월 기준으로 필터
        const schSnap = await getDocs(collection(db, 'schedules'));
        const allSchedules = schSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ScheduleDoc[];
        const filteredSchedules = allSchedules.filter((s) => {
          if (!s.date) return false;
          const monthKey = typeof s.date === 'string' ? normalizeMonth(s.date.slice(0, 7)) : getMonthKeyFromAny(s.date);
          return monthKey === selectedMonthKey;
        });
        setSchedules(filteredSchedules);
      } catch (e) {
        console.error('현시점예상급여 조회 데이터 로드 실패:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedMonthKey]);

  const rows = useMemo(() => {
    // 직원별로 현재일까지의 비교결과를 스케줄로 변환 후 PayrollCalculator로 계산
    const result: Array<{
      employeeId: string;
      employeeName: string;
      employmentType: EmploymentType;
      salaryLabel: string;
      totalHours: number;
      grossPay: number;
      totalDeductions: number;
      netPay: number;
    }> = [];

    // 조회일 기준 유효 계약 선택 함수
    const pickEffectiveContract = (employeeId: string): EmploymentContractDoc | undefined => {
      const list = contracts.filter(c => c.employeeId === employeeId);
      if (list.length === 0) return undefined;
      const withStart = list.map(c => {
        let sd: Date | undefined;
        const raw = (c as any).startDate;
        if (raw?.toDate) sd = raw.toDate();
        else if (typeof raw === 'string') sd = new Date(raw);
        return { ...c, _start: sd } as any;
      });
      // 조회일 이전(포함) 중 가장 최근, 없으면 시작일 있는 것 중 가장 최근
      const valid = withStart.filter(c => c._start && c._start <= selectedDateObj);
      const target = (valid.length > 0 ? valid : withStart).sort((a, b) => (b._start?.getTime() || 0) - (a._start?.getTime() || 0));
      return target[0];
    };

    employees.forEach((emp) => {
      const eff = pickEffectiveContract(emp.id);
      // 고용형태/급여는 계약서만 신뢰, 계약 없으면 미입력 및 0 처리
      const displayEmploymentType = (eff?.employmentType || '미입력') as EmploymentType;
      const employmentType = displayEmploymentType;
      // 시급/월급 표기 혼용 대응 (계약서 값만 사용)
      const rawSalaryType = eff?.salaryType;
      const salaryType = ((rawSalaryType === '월급' ? 'monthly' : rawSalaryType === '시급' ? 'hourly' : rawSalaryType) || 'hourly') as any;
      const salaryAmount = Number(eff?.salaryAmount || 0);

      // 현재일까지의 스케줄 구성 (schedules 컬렉션 기반)
      const schedulesForEmp = schedules
        .filter((s) => {
          if (s.employeeId !== emp.id || !s.date) return false;
          const sd = toDateSafe(s.date);
          if (!sd) return false;
          const sdOnly = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
          return sdOnly <= selectedDateOnly;
        })
        .map((s) => ({
          date: toDateSafe(s.date) || new Date(),
          // 요구사항: 해당일까지의 totalHours 합산 기준. 없으면 시간으로 계산
          actualWorkHours: Number((s.totalHours ?? calcHoursFromTimes(s.startTime, s.endTime, s.breakTime) ?? 0)),
          branchId: s.branchId || 'N/A',
          branchName: s.branchName || '합산',
        }));

      const summedHours = schedulesForEmp.reduce((sum, r) => sum + (Number(r.actualWorkHours) || 0), 0);

      // 계약 객체 구성
      const contract = {
        employmentType: displayEmploymentType,
        salaryType: salaryType,
        salaryAmount: salaryAmount,
        weeklyWorkHours: eff?.weeklyWorkHours,
        includeHolidayAllowance: eff?.includeHolidayAllowance,
      } as any;

      // 직원 객체 구성
      const employeeForCalc = {
        id: emp.id,
        name: emp.name,
        employmentType,
        salaryType,
        salaryAmount,
        weeklyWorkHours: eff?.weeklyWorkHours,
        includesWeeklyHolidayInWage: emp.includesWeeklyHolidayInWage,
      } as any;

      // 월급제 근로소득의 경우 스케줄이 없어도 월급 기준으로 계산됨
      // '미입력'은 계산 제외(0 처리). 지정된 유형은 그대로 계산 유틸 사용
      let calcResult: any = {
        actualWorkHours: summedHours,
        grossPay: 0,
        deductions: { total: 0 },
        netPay: 0,
      };
      if (employmentType !== '미입력' && salaryAmount > 0) {
        const calculator = new PayrollCalculator(employeeForCalc, contract, schedulesForEmp);
        calcResult = calculator.calculate();
      }

      const salaryLabel = salaryType === 'hourly' ? `${salaryAmount.toLocaleString()}원/시` : `${salaryAmount.toLocaleString()}원/월`;

      result.push({
        employeeId: emp.id,
        employeeName: emp.name,
        employmentType,
        salaryLabel,
        totalHours: Number(summedHours || 0),
        grossPay: Number(calcResult.grossPay || 0),
        totalDeductions: Number(calcResult.deductions?.total || 0),
        netPay: Number(calcResult.netPay || 0),
      });
    });

    // 이름순 정렬
    result.sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'ko'));
    return result;
  }, [employees, schedules, selectedDateObj]);

  const sumToDate = useMemo(() => rows.reduce((s, r) => s + r.netPay, 0), [rows]);
  
  // 근로소득(월급)과 사업소득/외국인(시급) 분리 계산
  const monthlySalarySum = useMemo(() => 
    rows.filter(r => r.employmentType === '근로소득').reduce((s, r) => s + r.netPay, 0), 
    [rows]
  );
  const hourlyWageSum = useMemo(() => 
    rows.filter(r => r.employmentType === '사업소득' || r.employmentType === '외국인').reduce((s, r) => s + r.netPay, 0), 
    [rows]
  );
  
  const forecast = useMemo(() => {
    const d = selectedDateObj.getDate();
    const dim = daysInMonth(selectedDateObj);
    if (d <= 0) return 0;
    
    // 시급 합계는 비례 계산, 월급 합계는 그대로
    const hourlyForecast = Math.round((hourlyWageSum / d) * dim);
    return hourlyForecast + monthlySalarySum;
  }, [hourlyWageSum, monthlySalarySum, selectedDateObj]);

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">현시점예상급여 조회</h3>
          <p className="text-sm text-gray-600 mt-1">직원별 현재까지의 스케줄을 기준으로 예상 급여를 계산합니다.</p>
        </div>
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-700">조회일:</label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700 border-b">직원이름</th>
              <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700 border-b">고용형태</th>
              <th className="px-3 py-2 text-right text-sm font-semibold text-gray-700 border-b">총 근무시간</th>
              <th className="px-3 py-2 text-right text-sm font-semibold text-gray-700 border-b">시급/월급</th>
              <th className="px-3 py-2 text-right text-sm font-semibold text-gray-700 border-b">총금액</th>
              <th className="px-3 py-2 text-right text-sm font-semibold text-gray-700 border-b">총공제액</th>
              <th className="px-3 py-2 text-right text-sm font-semibold text-gray-700 border-b">총지급액</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-3 text-center text-sm text-gray-500" colSpan={7}>불러오는 중...</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-center text-sm text-gray-500" colSpan={7}>데이터가 없습니다.</td>
              </tr>
            )}
            {!loading && rows.map((r) => (
              <tr key={r.employeeId} className="odd:bg-white even:bg-gray-50">
                <td className="px-3 py-2 text-sm text-gray-900 border-b">{r.employeeName}</td>
                <td className="px-3 py-2 text-sm text-gray-700 border-b">{r.employmentType}</td>
                <td className="px-3 py-2 text-sm text-right text-gray-700 border-b">{r.totalHours.toFixed(2)}</td>
                <td className="px-3 py-2 text-sm text-right text-gray-700 border-b">{r.salaryLabel}</td>
                <td className="px-3 py-2 text-sm text-right text-gray-700 border-b">{r.grossPay.toLocaleString()}원</td>
                <td className="px-3 py-2 text-sm text-right text-red-600 border-b">-{r.totalDeductions.toLocaleString()}원</td>
                <td className="px-3 py-2 text-sm text-right font-semibold text-blue-600 border-b">{r.netPay.toLocaleString()}원</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded">
          <div className="text-sm text-gray-600">현재까지 총지급액 합계 (F)</div>
          <div className="mt-1 text-2xl font-bold text-blue-700">{sumToDate.toLocaleString()}원</div>
        </div>
        <div className="p-4 bg-green-50 border border-green-200 rounded">
          <div className="text-sm text-gray-600">근로소득 합계 (D)</div>
          <div className="mt-1 text-xl font-bold text-green-700">{monthlySalarySum.toLocaleString()}원</div>
        </div>
        <div className="p-4 bg-orange-50 border border-orange-200 rounded">
          <div className="text-sm text-gray-600">사업소득+외국인 합계 (E)</div>
          <div className="mt-1 text-xl font-bold text-orange-700">{hourlyWageSum.toLocaleString()}원</div>
        </div>
        <div className="p-4 bg-purple-50 border border-purple-200 rounded">
          <div className="text-sm text-gray-600">월말까지 총지급액 예상합계</div>
          <div className="mt-1 text-2xl font-bold text-purple-700">{forecast.toLocaleString()}원</div>
          <div className="mt-1 text-xs text-gray-500">E ÷ 오늘까지의일수 × 이번달의날수 + D</div>
        </div>
      </div>
    </div>
  );
};

export default CurrentExpectedPayroll;


