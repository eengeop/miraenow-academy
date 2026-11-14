# Cloudflare 가상 안내장 데모

배포 주소: https://miraenow-notices-demo.leeeus99.workers.dev

Cloudflare Worker `miraenow-notices-demo`는 D1 `miraenow-notices-demo`와 비공개 R2 버킷 `miraenow-notices-demo`를 사용한다. R2 버킷에 공개 도메인이나 `r2.dev` 주소를 연결하지 않았다. `wrangler.jsonc`의 정적 자산에는 가상 화면과 PDF.js만 들어간다. 실제 안내장과 학생 정보는 이 데모에 올리지 않는다.

링크 토큰이 URL 경로에 있으므로 `wrangler.jsonc`에서 Worker Observability 로그를 비활성화한다. Worker 코드에도 요청 URL이나 토큰을 출력하는 로그를 두지 않는다. Cloudflare의 다른 서비스 로그·분석 설정까지 검증한 것으로 간주하지 않으며, 실제 자료 운영 전 별도로 확인한다.

## 재현 및 검증

Node.js 24 이상과 Cloudflare 계정의 Wrangler 로그인이 필요하다. Windows PowerShell에서는 `npm` 대신 `npm.cmd`를 사용한다.

```sh
npm ci
npm run check
wrangler d1 execute miraenow-notices-demo --remote --file=cloudflare/schema.sql --yes
npm run prepare:cloudflare-demo
```

준비 명령은 가상 PNG 2개와 PDF 1개, D1 입력 SQL, R2 업로드 목록을 Git 제외 경로 `tmp/cloudflare-demo/`에 만든다. 원본 링크 토큰은 `private/cloudflare-demo-links.json`에만 저장한다. 이미 준비한 자료를 덮어쓰지 않도록 두 번째 실행은 실패한다. 두 폴더의 파일을 커밋하거나 공개 PR·화면 캡처에 넣지 않는다.

`tmp/cloudflare-demo/manifest.json`의 각 `objectKey`, `file`, `mimeType`을 사용해 `wrangler r2 object put miraenow-notices-demo/<objectKey> --file=<file> --content-type=<mimeType> --remote`를 실행한다. 세 업로드가 모두 끝나면 다음 순서로 등록·배포한다.

```sh
wrangler d1 execute miraenow-notices-demo --remote --file=tmp/cloudflare-demo/seed.sql --yes
npm run build:cloudflare
wrangler deploy
CLOUDFLARE_DEMO_URL=https://miraenow-notices-demo.leeeus99.workers.dev npm run verify:cloudflare-demo
```

Windows PowerShell에서는 마지막 명령 전에 `$env:CLOUDFLARE_DEMO_URL = 'https://miraenow-notices-demo.leeeus99.workers.dev'`를 실행한다. 최초 발급 경로는 `private/cloudflare-demo-links.json`에 있고, 재발급한 안내장의 최신 경로는 `private/cloudflare-issued-links.jsonl`에 있다. 최신 `path`를 배포 주소 뒤에 붙이면 가상 안내장을 열 수 있다. 이 경로는 개별 안내장 접근 권한이므로 실제 자료에 사용할 때는 수신자에게만 전달한다.

## 오발송 시 링크 폐기·재발급

운영자는 먼저 해당 안내장 ID를 비공개 등록 기록에서 확인한다. 공개 관리 API 없이 로컬 Wrangler 로그인으로 D1을 변경한다. 명령에는 원본 링크 토큰을 넣지 않는다.

```sh
npm run cloudflare:links -- revoke <notice-id>
npm run cloudflare:links -- issue <notice-id>
```

오발송을 알게 되면 `revoke`를 먼저 실행하고 이전 링크의 화면·파일·다운로드가 모두 404인지 확인한다. 올바른 수신자를 확인한 뒤 `issue`를 실행한다. 새 링크 경로는 Git 제외 파일 `private/cloudflare-issued-links.jsonl`에만 저장된다. 링크 발급은 안내장 등록 후 30일의 보관 만료 시각을 연장하지 않는다. 새 링크를 전달하기 전에 해당 안내장만 열리는지 확인한다. 이미 다운로드된 사본은 링크 폐기로 회수할 수 없다.

가상 데모에서 절차를 확인할 때는 `npm run verify:cloudflare-links -- revoked <notice-id>`와 `npm run verify:cloudflare-links -- reissued <notice-id>`를 각각 실행한다. `CLOUDFLARE_DEMO_URL` 환경 변수가 필요하다. 전체 데모 검증 명령은 `private/cloudflare-issued-links.jsonl`에 새 경로가 있으면 이를 사용한다. 실제 자료가 담긴 링크는 이 가상 데모 검증 명령에 넣지 않는다.

데모 링크는 등록 시각부터 최대 30일간 유효하다. 만료되면 화면·파일·다운로드가 즉시 차단된다. 매시 정각 UTC의 예약 작업이 한 번에 최대 100개의 만료 R2 복사본과 D1 기록을 정리한다. R2 삭제 실패 시 기록을 남겨 다음 실행에서 재시도한다. 2026-11-14 가상 만료 PNG 1개(링크 미발급)를 등록해 실제 예약 정리를 확인했다. 등록 시각을 31일 전, 만료 시각을 1일 전으로 두고 R2 객체의 바이트 일치와 D1 기록 1건을 먼저 확인했다. UTC 13:00 예약 실행 후 D1 기록은 0건이 되었고 R2 조회는 해당 키가 없다고 응답했다. 기존 가상 링크 3개의 열람·파일·다운로드 검증도 다시 통과했다. 실제 학생 자료는 사용하지 않았다.

이 배포는 인증 없는 링크를 가진 사람 누구나 해당 안내장을 볼 수 있는 시험 환경이다. 실제 자료의 외부 제공 전에는 [접근·백업·파기 기준](data-policy.md)을 검토하고, 모바일 브라우저에서 PNG·PDF 열람과 다운로드를 확인한다.

2026-11-14 사용자 확인: 가상 데모의 모바일 이용에 문제가 없었다. 기기·브라우저 정보와 화면 캡처는 전달받지 않았으며, [품질 기록](quality.md)에 자동 검증과 구분해 적었다.
