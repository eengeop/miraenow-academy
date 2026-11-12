# Vercel 가상 자료 데모

이 배포는 개인 포트폴리오용 **가상 안내장 화면**만 공개합니다. `npm run build`가 만드는 `dist/`의 `index.html`, `styles.css`, `app.js`, `sample-notice.svg`만 제공됩니다. 온라인 데모에는 학생별 무작위 링크, PDF 뷰어, 안내장 등록·만료·다운로드 서버 기능이 없습니다. 이 기능들은 현재 로컬 서버에서만 동작합니다.

## 배포 절차

1. 이 변경을 `main`에 병합한 뒤 Vercel에서 **Add New → Project → Import Git Repository**로 `eengeop/miraenow-academy`를 선택합니다.
2. 프로젝트의 Root Directory를 저장소 루트로 둡니다. 저장소의 `vercel.json`이 `npm run build`와 출력 디렉터리 `dist`를 지정합니다. 첫 배포 전에 이 두 값이 화면에도 동일하게 보이는지 확인합니다.
3. 환경 변수는 추가하지 않습니다. 배포 결과의 `/`에서 가상 안내장과 확대 버튼을 확인하고, 모바일 화면에서 세로 스크롤과 다운로드를 확인합니다.
4. 공개 주소는 Vercel이 제공하는 `*.vercel.app`을 사용합니다. 별도 도메인은 나중에 연결할 수 있습니다.

`uploads/`, `private/`, `.env*`와 실제 안내장 파일은 Git 및 데모 빌드에 넣지 않습니다. 로컬 CLI 배포 시에는 `.vercelignore`가 빌드에 필요한 루트 파일만 업로드하도록 제한합니다. 배포 후에는 실제 자료가 담긴 링크를 이 데모 주소로 발급하지 않습니다.

Vercel Hobby는 개인·비상업적 용도로 제한됩니다. 학원 운영에 이 주소를 사용하기 전에 요금제·저장소·접근 및 파기 방식을 별도로 결정해야 합니다.
