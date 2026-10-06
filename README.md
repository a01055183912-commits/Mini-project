# 3-8 마케팅 벤치마킹 워크북

LOTTE LIFT 유통·리테일 과정 3-8 미니프로젝트용 웹앱입니다. 학생이 같은 양식(STEP 0~5)에 개인 답을 쓰면, 조 화면에서 나란히 비교하고 조장이 조 최종 답을 확정해 전략서(Markdown·PPTX·PDF)로 내보냅니다. 강사는 진행률을 실시간으로 보고 피드백·타이머·잠금을 쓸 수 있습니다.

- 로그인 없음: **수업 코드 → 조 → 이름**으로 입장 (`/join`)
- 질문·가이드 문구는 `config/steps.json`, 자료 찾기 링크는 `config/links.json`, 도구는 `config/tools.json`
- 앱에는 조별 정답·예시 아이디어가 없습니다 (질문·빈칸·가이드 문구만)

## 구성 (명세서와 다른 점)

| 영역 | 사용 기술 | 명세서 권장과 차이 |
|---|---|---|
| 프런트 | React 19 + Vite (JavaScript) | Next.js → Vite. 서버가 따로 있어 라우팅이 단순해 정적 빌드로 충분 |
| 서버·DB | Express + **PostgreSQL (Railway Postgres)** | Supabase → Railway 에 한 번에 배포하려고 변경. 권한 검사는 RLS 대신 서버 API 에서 수행 |
| 실시간 | Server-Sent Events (조 단위 채널) + 6초 보조 폴링 | Supabase Realtime → SSE |
| PPTX | pptxgenjs (브라우저에서 생성) | 동일 |
| PDF | pdfkit + Noto Sans KR (서버 생성) | print CSS 대신 서버 PDF (한글 폰트 포함, 링크 클릭 가능) |
| ZIP | jszip | 동일 |

## 로컬 실행 (10분)

필요: Node 20+, PostgreSQL 14+

```bash
npm install
createdb lift
cp .env.example .env            # DATABASE_URL, TEACHER_PASSWORD 수정
export $(grep -v '^#' .env | sed 's/ *#.*//' | xargs)   # 또는 환경변수를 직접 지정
npm run build && npm start      # http://localhost:3000
# 개발 모드(핫 리로드): npm run dev  → http://localhost:5173 (API 는 3000 으로 프록시)
```

처음 실행하면 테이블이 자동 생성되고 수업 코드 `LIFT38`(또는 `CLASS_CODE`)이 만들어집니다.
- 학생: `http://localhost:3000/join`
- 강사: `http://localhost:3000/teacher` (비밀번호 = `TEACHER_PASSWORD`)

## Railway 배포

1. Railway 에서 **New Project → Deploy from GitHub repo** 로 이 저장소를 선택합니다.
2. 같은 프로젝트에서 **+ New → Database → PostgreSQL** 을 추가합니다.
3. 앱 서비스 **Variables** 에 다음을 넣습니다.
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (Postgres 서비스 이름이 다르면 그 이름으로)
   - `TEACHER_PASSWORD` = 강사 비밀번호
   - `CLASS_CODE` = (선택) 처음 쓸 수업 코드
4. 앱 서비스 **Settings → Networking → Generate Domain** 으로 주소를 만듭니다.
5. 배포가 끝나면 `https://<도메인>/api/health` 가 `{"ok":true}` 인지 확인하고, `/teacher` 로 들어가 수업 코드를 확인합니다.

`railway.json` 에 시작 명령(`npm start`)과 헬스체크(`/api/health`)가 들어 있어 빌드(`npm run build`)는 자동 감지됩니다.
DB 에 공개(proxy) 주소로 붙는 경우에만 `PGSSL=true` 를 추가합니다.

### 수업 전날 체크리스트
- [ ] `npm run check-links` — 자료 찾기 링크가 모두 200 인지 확인 (죽은 링크는 목록으로 출력됨)
- [ ] `/teacher` → 설정에서 조별 주제·수업 코드 확인
- [ ] 노트북 2대로 같은 조 입장 → 한쪽 입력이 다른 쪽 [조 취합]에 바로 뜨는지 확인
- [ ] `npm run load-test` (배포 전 로컬 DB 에서만! 실행 시 데이터를 비웁니다)

### 수업 후
강사 화면 **내보내기** 에서 ZIP(조별 md·pptx·pdf + 전체 응답 CSV)을 받고, **설정 → 데이터 전체 삭제**로 지웁니다.

## 화면

| 경로 | 설명 |
|---|---|
| `/join` | 수업 코드·조·이름 입력 (같은 이름이면 "이어서 작성 / 다른 사람" 선택) |
| `/w` | 학생 워크북: STEP 0~5 개인 작성 · 조 취합 · 전략서 |
| `/teacher` | 진행 현황 매트릭스 · 조 보기(읽기 전용 + 문항별 피드백) · 설정 · 내보내기 |
| `/present/:team` | 발표 모드 (← → 키) |

## 점검 규칙 (`shared/checks.js`)
빈칸 · 근거(숫자+출처) · 수치 목표(숫자+기한) · 도구(메인 1·보조 ≤2) · 실행안↔도구 · 예산(합계 2억·예비비 1,000~2,000만 원·미선택 0원·메인 최대) · KPI(측정 방법·선행 지표) · ROI · 일관성(공통 키워드, 참고용).
출처 판정에서 `부`/`청`은 `산업통상부`·`통계청`처럼 앞에 한글 단어가 붙을 때만 인정합니다(`부산`이 출처로 잡히는 것 방지).

## 테스트

```bash
npm test                         # 점검 규칙·진행률·Markdown 형식 단위 테스트 (Vitest)
node tests/e2e.mjs               # 가입→작성→취합→내보내기 E2E (서버 실행 중 + Chromium 필요)
BASE=... TEACHER_PASSWORD=... npm run load-test   # 25명 동시 입력
```
E2E 환경변수: `BASE`(기본 http://localhost:3100), `TEACHER_PASSWORD`, `CHROME`(Chromium 실행 파일 경로).

## 보안·개인정보
- 수업 코드 없이는 어떤 데이터도 볼 수 없고, 학생 API 는 본인 조 데이터만 반환합니다 (서버에서 검사).
- 강사 비밀번호는 환경변수이며 DB 에는 scrypt 해시만 저장, 강사 세션은 서명된 토큰(12시간)입니다.
- 학생이 입력한 URL 은 http(s) 만 링크로 처리하고 `javascript:` 등은 저장을 거부합니다. 링크 미리보기는 사설 IP 를 차단합니다.
- 받는 개인정보는 이름뿐이며, 강사가 [데이터 전체 삭제]로 지울 수 있습니다.

## 알려진 한계
- PPTX 글꼴은 `맑은 고딕`입니다 (`a고딕13`은 설치 여부를 알 수 없어 대체).
- 답 변경 이력은 DB(`answers_history`)에 쌓이지만 화면의 되돌리기(undo) UI 는 아직 없습니다.
- 명세서 2장의 "조장이 조원 답 잠금 해제"는 별도 기능 없이, 강사의 STEP·전체 잠금만 구현했습니다.
- 3단계(AI 힌트, 수업 복제)는 구현하지 않았습니다.
