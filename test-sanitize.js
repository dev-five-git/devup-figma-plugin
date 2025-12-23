// 속성 이름을 유효한 TypeScript 식별자로 변환
function sanitizePropertyName(name) {
  // 한글, 공백, 특수문자를 camelCase로 변환
  return (
    name
      .trim()
      .replace(/[^\w가-힣]+(.)/g, (_, chr) => chr.toUpperCase()) // 공백/특수문자 제거 및 다음 문자 대문자화
      .replace(/^[^a-zA-Z_$]/, '_') // 첫 문자가 숫자나 유효하지 않은 문자면 _ 추가
      .replace(/[^\w$]/g, '') || // 한글 및 유효하지 않은 문자 제거
    'property'
  ) // 빈 문자열이면 기본값 사용
}

// 테스트
console.log('속성 1 ->', sanitizePropertyName('속성 1'))
console.log('Property Name ->', sanitizePropertyName('Property Name'))
console.log('my-property ->', sanitizePropertyName('my-property'))
console.log('디바이스 타입 ->', sanitizePropertyName('디바이스 타입'))
console.log('1번속성 ->', sanitizePropertyName('1번속성'))
