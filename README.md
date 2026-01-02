# PKM Note Recommender

AI 기반 시맨틱 유사도와 태그/그래프 연결 기반으로 관련 노트를 추천하는 Obsidian 플러그인입니다.

## Features

- **AI 시맨틱 추천**: OpenAI, Google Gemini, Anthropic(Voyage AI) 임베딩을 활용한 의미 기반 유사도 분석
- **태그 기반 추천**: 유사한 태그를 가진 노트 찾기
- **그래프 연결**: 지식 그래프 구조 활용
- **사이드바 뷰**: 관련 노트에 빠르게 접근
- **상태바 표시**: 추천 수를 한눈에 확인
- **자동 임베딩**: 노트 수정 시 자동으로 임베딩 업데이트

## Supported AI Providers

| Provider | Model | 특징 |
|----------|-------|------|
| **OpenAI** (기본) | text-embedding-3-small | 가장 안정적, 1536 차원 |
| **Google Gemini** | text-embedding-004 | 768 차원, 무료 티어 제공 |
| **Anthropic (Voyage AI)** | voyage-3-lite | 고품질, 512 차원 |

## Installation

### BRAT (권장)

1. [BRAT](https://github.com/TfTHacker/obsidian42-brat) 플러그인 설치
2. BRAT 설정 열기
3. "Add Beta plugin" 클릭
4. 입력: `eohjun/obsidian-pkm-note-recommender`
5. 플러그인 활성화

### Manual

1. 최신 릴리스에서 `main.js`, `manifest.json`, `styles.css` 다운로드
2. 폴더 생성: `<vault>/.obsidian/plugins/pkm-note-recommender/`
3. 다운로드한 파일을 폴더에 복사
4. Obsidian 설정에서 플러그인 활성화

## Setup (AI 추천 기능)

### 1. API 키 설정

1. Settings → PKM Note Recommender 열기
2. **AI Provider Settings** 섹션에서:
   - AI Provider 선택 (OpenAI 권장)
   - API 키 입력
   - **Test** 버튼으로 키 유효성 확인

### 2. 임베딩 생성

1. Command Palette (Ctrl/Cmd + P) 열기
2. "PKM: Generate embeddings for all notes" 실행
3. 진행 상황이 상태바에 표시됨 (예: `💡 45`)
4. 완료 후 시맨틱 추천 기능 사용 가능

## Commands

| 명령어 | 설명 |
|--------|------|
| **Show note recommendations** | 추천 패널 열기 |
| **Refresh note recommendations** | 추천 새로고침 |
| **Generate embeddings for all notes** | 전체 노트 임베딩 생성 (최초 설정 시 필수) |
| **Generate embedding for current note** | 현재 노트만 임베딩 생성 |
| **Clear all embeddings** | 모든 임베딩 삭제 (프로바이더 변경 시 필요) |
| **Show embedding statistics** | 임베딩 통계 확인 |

### 임베딩 명령어 상세 설명

#### Generate embeddings for all notes
- Zettelkasten 폴더의 모든 노트에 대해 임베딩 벡터를 한 번에 생성
- **최초 설정 시 필수**: 처음 플러그인 설치 후 실행해야 시맨틱 추천이 작동
- 이미 임베딩이 있는 노트는 건너뛰고, 변경된 노트만 새로 생성 (content hash로 감지)
- API 비용이 발생하므로 노트가 많으면 시간이 걸릴 수 있음

#### Generate embedding for current note
- 지금 열려있는 노트 하나에 대해서만 임베딩 생성
- 새 노트를 작성한 후 바로 추천을 받고 싶을 때 사용
- Auto-embed 옵션이 켜져 있으면 자동으로 처리되므로 수동 실행 불필요

#### Clear all embeddings
- 저장된 모든 임베딩 데이터를 삭제
- **사용 시점**:
  - AI 프로바이더를 변경했을 때 (OpenAI → Gemini 등)
  - 임베딩 모델이 다르면 벡터 차원이 달라서 기존 데이터가 호환되지 않음
- 삭제 후 "Generate embeddings for all notes"로 다시 생성 필요

#### Show embedding statistics
- 현재 저장된 임베딩 정보 표시:
  - Provider: 사용 중인 AI 프로바이더
  - Model: 임베딩 모델명
  - Total embeddings: 임베딩이 생성된 노트 수
  - Storage size: 저장 공간 사용량

## Usage Workflow

```
1. API 키 설정 → Test로 확인
2. "Generate embeddings for all notes" 실행 (최초 1회)
3. 이후 Auto-embed가 켜져 있으면 새 노트/수정된 노트는 자동 처리
4. 추천 패널에서 시맨틱 유사도 기반 추천 확인
```

## Settings

### Recommendation Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Zettelkasten Folder | 노트 위치 | `04_Zettelkasten` |
| Max Recommendations | 최대 추천 수 | 5 |
| Min Score | 최소 점수 임계값 | 30% |
| Use Graph Connections | 연결된 노트 포함 | true |
| Use Tag Similarity | 태그 유사도 사용 | true |
| Use Semantic Similarity | AI 시맨틱 유사도 사용 | true |

### AI Provider Settings

| Setting | Description | Default |
|---------|-------------|---------|
| AI Provider | 사용할 AI 프로바이더 | OpenAI |
| API Key | 선택한 프로바이더의 API 키 | - |
| Auto-embed notes | 노트 수정 시 자동 임베딩 | true |
| Semantic Threshold | 시맨틱 유사도 임계값 | 50% |

### Display Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Auto-show recommendations | 노트 열 때 자동으로 추천 표시 | false |
| Show in sidebar | 사이드바에 추천 표시 | true |
| Debug mode | 디버그 정보 로깅 | false |

## Development

```bash
# Install dependencies
npm install

# Development with watch mode
npm run dev

# Production build
npm run build

# Type check
npm run typecheck
```

## Architecture

Clean Architecture 원칙을 따르는 구조:

```
src/
├── core/
│   ├── domain/           # 엔티티, 인터페이스, Value Objects
│   ├── application/      # Use Cases, Services
│   └── adapters/         # LLM Adapters, Storage, Obsidian Adapters
├── views/                # UI Components
└── main.ts               # Plugin Entry Point
```

## License

MIT
