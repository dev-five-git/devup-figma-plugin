# Smart Transition to Keyframe Generator

이 기능은 Figma의 reactions(상호작용) 속성에서 SMART_ANIMATE 트랜지션을 감지하고 CSS 키프레임 애니메이션으로 변환합니다.

## 개요

Figma에서 컴포넌트 세트(Component Set)의 variants 간에 SMART_ANIMATE 트랜지션을 설정하면, 이를 다음 두 가지 방식으로 변환할 수 있습니다:

1. **CSS Transition** (기본값): hover, active 등의 상태 변화 시 자동으로 적용되는 트랜지션
2. **CSS Keyframe Animation** (새로운 기능): 더 세밀한 제어가 가능한 키프레임 애니메이션

## 사용 방법

### 1. 기본 사용 (CSS Transition)

```typescript
import { getSelectorProps } from './codegen/props/selector'

// 기본 동작 - CSS transition 생성
const result = await getSelectorProps(componentSetNode)

// 결과:
// {
//   props: {
//     _hover: { opacity: "0.8" },
//     transition: "300ms ease-in-out",
//     transitionProperty: "opacity"
//   },
//   variants: { ... }
// }
```

### 2. 키프레임 애니메이션 사용

```typescript
import { getSelectorProps } from './codegen/props/selector'

// useKeyframes 옵션 활성화
const result = await getSelectorProps(componentSetNode, { useKeyframes: true })

// 결과:
// {
//   props: {
//     _hover: { opacity: "0.8" }
//   },
//   variants: { ... },
//   keyframes: [
//     {
//       name: "hover-animation-abc123",
//       keyframes: "@keyframes hover-animation-abc123 { ... }",
//       animation: "hover-animation-abc123 300ms ease-in-out forwards",
//       properties: ["opacity"]
//     }
//   ]
// }
```

## 키프레임 모듈 API

### `generateKeyframeFromTransition()`

단일 트랜지션에서 키프레임 애니메이션을 생성합니다.

```typescript
import { generateKeyframeFromTransition } from './codegen/props/keyframe'

const keyframe = generateKeyframeFromTransition(
  { opacity: '1' },              // defaultProps - 시작 상태
  { opacity: '0.8' },            // targetProps - 끝 상태
  {                              // transition - Figma 트랜지션 객체
    type: 'SMART_ANIMATE',
    duration: 0.3,               // 초 단위
    easing: { type: 'EASE_IN_OUT' }
  },
  'hover',                       // effect - 효과 타입
  'node-id-123'                  // nodeId - 고유 ID
)

// 결과:
// {
//   name: "hover-animation-pemt2n",
//   keyframes: `@keyframes hover-animation-pemt2n {
//     from {
//       opacity: 1;
//     }
//     to {
//       opacity: 0.8;
//     }
//   }`,
//   animation: "hover-animation-pemt2n 300ms ease-in-out forwards",
//   properties: ["opacity"]
// }
```

### `generateKeyframesForEffects()`

여러 효과(hover, active 등)에 대한 키프레임을 한 번에 생성합니다.

```typescript
import { generateKeyframesForEffects } from './codegen/props/keyframe'

const defaultProps = { opacity: '1', backgroundColor: '#ffffff' }
const effectProps = new Map([
  ['hover', { opacity: '0.8' }],
  ['active', { opacity: '0.6', backgroundColor: '#eeeeee' }]
])

const animations = generateKeyframesForEffects(
  defaultProps,
  effectProps,
  transition,
  'component-id'
)

// 결과: KeyframeAnimation[]
// [
//   { name: "hover-animation-...", ... },
//   { name: "active-animation-...", ... }
// ]
```

### 유틸리티 함수

#### `isSmartAnimateTransition()`

트랜지션이 SMART_ANIMATE 타입인지 확인합니다.

```typescript
import { isSmartAnimateTransition } from './codegen/props/keyframe'

if (isSmartAnimateTransition(transition)) {
  // SMART_ANIMATE 트랜지션 처리
}
```

#### `extractTransitionFromReactions()`

Figma reactions 배열에서 트랜지션을 추출합니다.

```typescript
import { extractTransitionFromReactions } from './codegen/props/keyframe'

const transition = extractTransitionFromReactions(node.reactions)
```

## 생성되는 키프레임 구조

### KeyframeAnimation 인터페이스

```typescript
interface KeyframeAnimation {
  /** 고유한 애니메이션 이름 (예: "hover-animation-abc123") */
  name: string

  /** CSS @keyframes 정의 문자열 */
  keyframes: string

  /** CSS animation 속성 값 */
  animation: string

  /** 애니메이션되는 속성 배열 */
  properties: string[]
}
```

### 생성 예시

```css
/* keyframes 속성 */
@keyframes hover-animation-abc123 {
  from {
    opacity: 1;
    transform: translateX(0px);
  }
  to {
    opacity: 0.8;
    transform: translateX(10px);
  }
}

/* animation 속성 */
animation: hover-animation-abc123 300ms ease-in-out forwards;
```

## Figma 설정 방법

1. **Component Set 생성**: 버튼 등의 컴포넌트를 Component Set으로 만듭니다
2. **Variants 추가**: Default, Hover, Active 등의 variants를 추가합니다
3. **Properties 변경**: 각 variant에서 애니메이션할 속성(opacity, position 등)을 설정합니다
4. **Prototype 설정**:
   - Default variant를 선택
   - Prototype 패널에서 interaction 추가
   - Trigger: "On hover" 또는 "On press" 선택
   - Action: 대상 variant 선택
   - Animation: "Smart animate" 선택
   - Duration과 Easing 설정

## 지원되는 Trigger 타입

- `ON_HOVER` → `hover` 효과
- `ON_PRESS` → `active` 효과

## 지원되는 Easing 타입

모든 Figma easing 타입이 지원됩니다:

- `EASE_IN` → `ease-in`
- `EASE_OUT` → `ease-out`
- `EASE_IN_OUT` → `ease-in-out`
- `LINEAR` → `linear`
- 기타 등등 (언더스코어는 하이픈으로 변환됨)

## 고급 사용 사례

### 1. 복잡한 속성 애니메이션

```typescript
const defaultProps = {
  opacity: '1',
  transform: 'scale(1) rotate(0deg)',
  backgroundColor: '#ffffff',
  boxShadow: '0 0 0 rgba(0,0,0,0)'
}

const hoverProps = {
  opacity: '0.9',
  transform: 'scale(1.05) rotate(5deg)',
  backgroundColor: '#f0f0f0',
  boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
}

const keyframe = generateKeyframeFromTransition(
  defaultProps,
  hoverProps,
  transition,
  'hover',
  nodeId
)
```

### 2. 여러 상태 처리

```typescript
const effectProps = new Map([
  ['hover', { opacity: '0.8' }],
  ['active', { opacity: '0.6' }],
  ['focus', { opacity: '0.9', outline: '2px solid blue' }]
])

const animations = generateKeyframesForEffects(
  defaultProps,
  effectProps,
  transition,
  nodeId
)
```

## 테스트

키프레임 생성 기능은 완전한 단위 테스트를 포함합니다:

```bash
bun test src/codegen/props/__tests__/keyframe.test.ts
```

테스트 커버리지:
- 함수 커버리지: 100%
- 라인 커버리지: 93.22%

## 주의사항

1. **Duration 단위**: Figma의 duration은 초 단위이며, 자동으로 밀리초(ms)로 변환됩니다
2. **고유 이름**: 각 애니메이션은 effect 타입, 속성, nodeId를 기반으로 고유한 이름을 생성합니다
3. **animation-fill-mode**: 기본적으로 `forwards`가 적용되어 애니메이션 종료 상태가 유지됩니다
4. **속성 필터링**: 시작 상태와 끝 상태가 동일한 속성은 자동으로 제외됩니다

## 향후 개선 사항

- [ ] 중간 키프레임 지원 (0%, 50%, 100% 등)
- [ ] animation-iteration-count 옵션
- [ ] animation-direction 옵션
- [ ] 커스텀 easing 함수 (cubic-bezier)
- [ ] 다중 애니메이션 체인
- [ ] 조건부 애니메이션 (media query)
