# YouTube Sentiment Analyzer - Project Documentation

## 📋 Project Overview

This project is a **YouTube Comment Sentiment Analyzer** that uses a hybrid AI approach combining a fine-tuned **DistilRoBERTa** model with **Google's Gemma 3** LLM to accurately classify the sentiment of YouTube comments. The system is accessible via a Chrome Extension that integrates directly with YouTube.

---

## 🏗️ System Architecture Diagram

```mermaid
flowchart TB
    subgraph User_Interface["🌐 User Interface"]
        YT["📺 YouTube Website"]
        CE["🔌 Chrome Extension"]
    end

    subgraph Backend_Services["🖥️ Backend Services (Docker)"]
        subgraph FastAPI_Container["FastAPI Container (Port 8000)"]
            API["🚀 FastAPI Server"]
            PE["/predict Endpoint"]
            SE["/summarize Endpoint"]
            HE["/health Endpoint"]
        end
        
        subgraph ML_Models["🤖 ML Models"]
            DR["DistilRoBERTa<br/>(Fine-tuned)"]
            TK["Tokenizer"]
        end
    end

    subgraph External_LLM["🧠 External LLM Service"]
        GM["Gemma 3 Model<br/>(localhost:12434)"]
    end

    YT --> |"User clicks Analyze"| CE
    CE --> |"Extract Comments"| YT
    CE --> |"POST /predict"| PE
    CE --> |"POST /summarize"| SE
    
    PE --> DR
    PE --> TK
    PE --> |"Low Confidence<br/>(<90%)"| GM
    SE --> GM
    
    DR --> |"High Confidence<br/>(>90%)"| PE
    GM --> |"Hybrid Response"| PE
    
    PE --> |"Sentiment Result"| CE
    SE --> |"Summary Text"| CE
    CE --> |"Display Results"| YT

    style User_Interface fill:#e1f5fe,stroke:#01579b
    style Backend_Services fill:#f3e5f5,stroke:#4a148c
    style External_LLM fill:#fff3e0,stroke:#e65100
    style FastAPI_Container fill:#e8f5e9,stroke:#1b5e20
    style ML_Models fill:#fce4ec,stroke:#880e4f
```

---

## 🔄 Data Flow Diagram

```mermaid
sequenceDiagram
    participant U as 👤 User
    participant CE as 🔌 Chrome Extension
    participant YT as 📺 YouTube Page
    participant API as 🚀 FastAPI Server
    participant DR as 🤖 DistilRoBERTa
    participant GM as 🧠 Gemma 3

    U->>CE: Click "Analyze" Button
    CE->>YT: Execute Script (getComments)
    YT-->>CE: Return Comments Array
    
    loop For Each Comment (Batch of 5)
        CE->>API: POST /predict {text: comment}
        API->>DR: Tokenize & Predict
        DR-->>API: {sentiment, confidence}
        
        alt Confidence > 90%
            API-->>CE: Return DistilRoBERTa Result
        else Confidence ≤ 90%
            API->>GM: Chat Completion Request
            GM-->>API: Sentiment Classification
            API-->>CE: Return Gemma 3 Result (Hybrid)
        end
    end
    
    CE->>API: POST /summarize {comments: [...]}
    API->>GM: Generate Summary Prompt
    GM-->>API: Summary Text
    API-->>CE: Return Summary
    
    CE->>U: Display Stats & Summary
```

---

## 🧩 Component Architecture

```mermaid
graph LR
    subgraph Chrome_Extension["Chrome Extension"]
        MF["manifest.json<br/>(Config)"]
        PH["popup.html<br/>(UI)"]
        PJ["popup.js<br/>(Logic)"]
        IC["icon.png<br/>(Assets)"]
    end

    subgraph FastAPI_Application["FastAPI Application"]
        APP["app.py"]
        
        subgraph Endpoints["API Endpoints"]
            E1["POST /predict"]
            E2["POST /summarize"]
            E3["GET /health"]
        end
        
        subgraph Models_Classes["Pydantic Models"]
            M1["SentimentRequest"]
            M2["SentimentResponse"]
            M3["SummarizeRequest"]
            M4["SummarizeResponse"]
        end
        
        subgraph Core_Functions["Core Functions"]
            F1["load_model()"]
            F2["call_gemma()"]
            F3["predict()"]
            F4["summarize()"]
        end
    end

    subgraph ML_Pipeline["ML Pipeline"]
        TN["train.ipynb<br/>(Training)"]
        DS["YoutubeCommentsDataSet.csv"]
        SD["sentiment_distilroberta/<br/>(Model Checkpoints)"]
    end

    subgraph Docker_Infrastructure["Docker Infrastructure"]
        DF["Dockerfile"]
        DC["docker-compose.yml"]
        RQ["requirements.txt"]
        BS["build_and_run.sh"]
    end

    PJ --> E1
    PJ --> E2
    E1 --> F3
    E2 --> F4
    F3 --> F2
    F4 --> F2
    TN --> SD
    DS --> TN
    
    style Chrome_Extension fill:#bbdefb,stroke:#1565c0
    style FastAPI_Application fill:#c8e6c9,stroke:#2e7d32
    style ML_Pipeline fill:#ffecb3,stroke:#ff8f00
    style Docker_Infrastructure fill:#f8bbd9,stroke:#c2185b
```

---

## 🔀 Hybrid Sentiment Analysis Logic

```mermaid
flowchart TD
    A["📝 Input Comment"] --> B["Tokenize with<br/>DistilRoBERTa Tokenizer"]
    B --> C["Run DistilRoBERTa<br/>Inference"]
    C --> D["Calculate Softmax<br/>Probabilities"]
    D --> E{"Confidence<br/>> 90%?"}
    
    E -->|"✅ Yes"| F["Return DistilRoBERTa<br/>Prediction"]
    F --> G["Model Used:<br/>DistilRoBERTa"]
    
    E -->|"❌ No"| H["Call Gemma 3<br/>via Chat API"]
    H --> I{"Gemma Call<br/>Successful?"}
    
    I -->|"✅ Yes"| J["Return Gemma 3<br/>Prediction"]
    J --> K["Model Used:<br/>Gemma 3 (Hybrid)"]
    
    I -->|"❌ No"| L["Fallback to<br/>DistilRoBERTa"]
    L --> M["Model Used:<br/>DistilRoBERTa (Fallback)"]
    
    G --> N["📊 Final Response"]
    K --> N
    M --> N

    style A fill:#e3f2fd,stroke:#1976d2
    style E fill:#fff9c4,stroke:#f9a825
    style I fill:#fff9c4,stroke:#f9a825
    style N fill:#c8e6c9,stroke:#388e3c
```

---

## 🏛️ Deployment Architecture

```mermaid
graph TB
    subgraph Host_Machine["🖥️ Host Machine (macOS/Linux)"]
        subgraph Docker_Network["Docker Network"]
            subgraph Sentiment_Container["sentiment-app Container"]
                UV["Uvicorn Server<br/>:8000"]
                FA["FastAPI App"]
                HF["🤗 Transformers<br/>DistilRoBERTa"]
                PT["🔥 PyTorch"]
            end
        end
        
        GS["Gemma 3 Service<br/>:12434"]
        BR["🌐 Browser<br/>(Chrome)"]
    end

    Sentiment_Container -->|"host.docker.internal:12434"| GS
    BR -->|"localhost:8000"| UV
    UV --> FA
    FA --> HF
    FA --> PT

    style Host_Machine fill:#eceff1,stroke:#455a64
    style Docker_Network fill:#e8eaf6,stroke:#3f51b5
    style Sentiment_Container fill:#e1f5fe,stroke:#0288d1
```

---

## 📁 Project Structure

```mermaid
graph TD
    ROOT["📂 IBM 2/"]
    
    ROOT --> APP["📄 app.py<br/><small>Main FastAPI Server</small>"]
    ROOT --> REQ["📄 requirements.txt<br/><small>Python Dependencies</small>"]
    ROOT --> DF["📄 Dockerfile<br/><small>Container Build</small>"]
    ROOT --> DC["📄 docker-compose.yml<br/><small>Multi-service Config</small>"]
    ROOT --> BS["📄 build_and_run.sh<br/><small>Build Script</small>"]
    ROOT --> TRAIN["📓 train.ipynb<br/><small>Model Training</small>"]
    ROOT --> DS["📊 YoutubeCommentsDataSet.csv<br/><small>Training Data</small>"]
    
    ROOT --> MODEL["📂 sentiment_distilroberta/"]
    MODEL --> CP["📂 checkpoint-1500/<br/><small>Trained Model</small>"]
    
    ROOT --> EXT["📂 chrome_extension/"]
    EXT --> MAN["📄 manifest.json"]
    EXT --> POP_H["📄 popup.html"]
    EXT --> POP_J["📄 popup.js"]
    EXT --> ICON["🖼️ icon.png"]

    style ROOT fill:#fff3e0,stroke:#e65100
    style MODEL fill:#e8f5e9,stroke:#388e3c
    style EXT fill:#e3f2fd,stroke:#1976d2
```

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Chrome Extension (Manifest V3) | User interface for YouTube integration |
| **API Framework** | FastAPI + Uvicorn | High-performance async REST API |
| **ML Framework** | PyTorch + HuggingFace Transformers | Model loading and inference |
| **Primary Model** | DistilRoBERTa (Fine-tuned) | Fast sentiment classification |
| **Backup LLM** | Google Gemma 3 | Handles low-confidence predictions |
| **Containerization** | Docker + Docker Compose | Consistent deployment environment |
| **Language** | Python 3.10, JavaScript | Backend and extension logic |

---

## 📡 API Endpoints

### POST `/predict`
Analyzes sentiment of a single comment.

```json
// Request
{
    "text": "This video is amazing!"
}

// Response
{
    "sentiment": "positive",
    "confidence": 0.95,
    "model_used": "DistilRoBERTa"
}
```

### POST `/summarize`
Generates a summary of multiple comments.

```json
// Request
{
    "comments": ["Great video!", "Very helpful", "Loved it"]
}

// Response
{
    "summary": "Viewers express positive sentiment, praising the video quality and helpfulness."
}
```

### GET `/health`
Health check endpoint.

```json
{
    "status": "healthy"
}
```

---

## 🚀 Getting Started

### Prerequisites
- Docker & Docker Compose
- Gemma 3 running on `localhost:12434`
- Google Chrome browser

### Quick Start

```bash
# Build and run the sentiment analysis service
docker-compose up --build

# Load Chrome Extension
# 1. Open chrome://extensions
# 2. Enable Developer Mode
# 3. Click "Load unpacked"
# 4. Select the chrome_extension folder
```

---

## 📊 Workflow Summary

```mermaid
journey
    title User Journey: Analyzing YouTube Comments
    section Setup
      Start Docker Container: 5: Developer
      Load Chrome Extension: 5: Developer
    section Usage
      Navigate to YouTube Video: 5: User
      Click Extension Icon: 5: User
      Click Analyze Button: 5: User
    section Processing
      Extract Comments from Page: 3: Extension
      Send to FastAPI Backend: 3: Extension
      Run Hybrid ML Analysis: 4: Backend
      Generate AI Summary: 4: Backend
    section Results
      Display Sentiment Stats: 5: User
      Show Comment Summary: 5: User
```

---

## 📝 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Dec 2024 | Initial release with hybrid DistilRoBERTa + Gemma 3 |

---

*Generated on: December 11, 2024*
