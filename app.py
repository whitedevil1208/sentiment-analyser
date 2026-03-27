from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoModelForSequenceClassification, AutoTokenizer
import torch
import os
import requests
import json
from collections import Counter
import re

# Define request model
class SentimentRequest(BaseModel):
    text: str

# Define response model
class SentimentResponse(BaseModel):
    sentiment: str
    confidence: float
    model_used: str

app = FastAPI(title="YouTube Sentiment Analysis API")

# Global variables for model and tokenizer
model = None
tokenizer = None
# Point to the specific checkpoint directory where config.json and tokenizer files exist
model_path = "./sentiment_distilroberta/checkpoint-1500"
# Default to the chat completions endpoint
GEMMA_API_URL = os.getenv("GEMMA_API_URL", "http://localhost:12434/engines/v1/chat/completions")
GEMMA_MODEL_NAME = "ai/gemma3"

@app.on_event("startup")
async def load_model():
    global model, tokenizer
    try:
        print(f"Loading model from {model_path}...")
        tokenizer = AutoTokenizer.from_pretrained(model_path)
        model = AutoModelForSequenceClassification.from_pretrained(model_path)
        model.eval() # Set to evaluation mode
        print("Model loaded successfully.")
    except Exception as e:
        print(f"Error loading model: {e}")
        raise RuntimeError(f"Failed to load model: {e}")

def call_gemma(text):
    """
    Calls the Gemma 3 model for sentiment analysis using Chat Completions API.
    """
    prompt = f"""Analyze the sentiment of the following YouTube comment. 
    Respond with EXACTLY one word: 'positive', 'neutral', or 'negative'.
    
    Comment: "{text}"
    Sentiment:"""
    
    payload = {
        "model": GEMMA_MODEL_NAME,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "max_tokens": 100
    }
    
    try:
        response = requests.post(GEMMA_API_URL, json=payload, timeout=10)
        response.raise_for_status()
        result = response.json()
        # Parse OpenAI-compatible response
        sentiment = result["choices"][0]["message"]["content"].strip().lower()
        
        # Normalize output
        if "positive" in sentiment: return "positive"
        if "negative" in sentiment: return "negative"
        return "neutral"
    except Exception as e:
        print(f"Gemma call failed: {e}")
        return None

@app.post("/predict", response_model=SentimentResponse)
async def predict(request: SentimentRequest):
    if not model or not tokenizer:
        raise HTTPException(status_code=500, detail="Model not initialized")

    try:
        # 1. DistilRoBERTa Inference
        inputs = tokenizer(request.text, return_tensors="pt", truncation=True, max_length=512)
        with torch.no_grad():
            outputs = model(**inputs)
        
        probabilities = torch.nn.functional.softmax(outputs.logits, dim=-1)
        predicted_class_id = torch.argmax(probabilities, dim=-1).item()
        confidence = probabilities[0][predicted_class_id].item()
        sentiment = model.config.id2label[predicted_class_id]
        
        # 2. Hybrid Logic
        # If confidence is high, trust DistilRoBERTa
        if confidence > 0.90:
            return SentimentResponse(
                sentiment=sentiment, 
                confidence=confidence, 
                model_used="DistilRoBERTa"
            )
        
        # If confidence is low, ask Gemma 3
        print(f"Low confidence ({confidence:.2f}). Calling Gemma 3...")
        gemma_sentiment = call_gemma(request.text)
        
        if gemma_sentiment:
            # We trust Gemma's reasoning for ambiguous cases, 
            # but we'll assign a synthetic confidence or reuse the original if it matches
            return SentimentResponse(
                sentiment=gemma_sentiment, 
                confidence=0.85, # Synthetic confidence for LLM
                model_used="Gemma 3 (Hybrid)"
            )
        else:
            # Fallback to DistilRoBERTa if Gemma fails
            return SentimentResponse(
                sentiment=sentiment, 
                confidence=confidence, 
                model_used="DistilRoBERTa (Fallback)"
            )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SummarizeRequest(BaseModel):
    comments: list[str]

class SummarizeResponse(BaseModel):
    summary: str

def analyze_bias(comments_text: str) -> str:
    """Make a separate call to analyze bias in comments."""
    bias_prompt = f"""Analyze the following YouTube comments for any bias. 
Identify if there is: creator bias, product bias, political bias, cultural bias, demographic bias, or if comments appear balanced.
Respond with ONLY a single short sentence describing the bias (or lack thereof).

Comments:
{comments_text}

Bias:"""
    
    payload = {
        "model": GEMMA_MODEL_NAME,
        "messages": [
            {"role": "user", "content": bias_prompt}
        ],
        "max_tokens": 50
    }
    
    try:
        response = requests.post(GEMMA_API_URL, json=payload, timeout=15)
        response.raise_for_status()
        result = response.json()
        bias = result["choices"][0]["message"]["content"].strip()
        return bias
    except Exception as e:
        print(f"Bias analysis failed: {e}")
        return "Bias analysis unavailable."

def fallback_summary(comments: list[str]) -> str:
    """Lightweight on-device summary to avoid hard failures if Gemma is down."""
    if not comments:
        return "No comments to summarize."
    # Simple keyword-based gist
    text = " ".join(comments).lower()
    tokens = re.findall(r"[a-zA-Z]{4,}", text)
    stop = {
        "this","that","with","have","from","video","your","they","them","what","when","where",
        "will","would","could","should","about","because","there","their","which","than","been",
        "more","very","really","just","like","love","hate","dont","doesnt","cant","wont","yeah",
        "good","great","well","also","some","most","much","even"
    }
    tokens = [t for t in tokens if t not in stop]
    common = Counter(tokens).most_common(5)
    keywords = ", ".join([w for w, _ in common]) if common else "no clear keywords"
    count = len(comments)
    return f"Quick take from {count} comments: conversation centers on {keywords}."
@app.post("/summarize", response_model=SummarizeResponse)
async def summarize(request: SummarizeRequest):
    if not request.comments:
        return SummarizeResponse(summary="No comments to summarize.")
    
    # Concatenate comments, limiting total length to avoid context window issues
    combined_text = "\n".join(request.comments)
    if len(combined_text) > 2000:
        combined_text = combined_text[:2000] + "...(truncated)"

    # Step 1: Get summary
    summary_prompt = f"""Summarize the following YouTube comments into a concise sentence that captures the general sentiment and main topics discussed.

Comments:
{combined_text}

Summary:"""
    
    payload = {
        "model": GEMMA_MODEL_NAME,
        "messages": [
            {"role": "user", "content": summary_prompt}
        ],
        "max_tokens": 150
    }
    
    try:
        print("Sending summarization request to Gemma...")
        response = requests.post(GEMMA_API_URL, json=payload, timeout=15)
        response.raise_for_status()
        result = response.json()
        summary = result["choices"][0]["message"]["content"].strip()
        
        # Step 2: Get bias analysis separately (guaranteed to be included)
        print("Analyzing bias...")
        bias = analyze_bias(combined_text)
        
        # Combine summary and bias
        final_response = f"{summary}\n\nBias: {bias}"
        
        return SummarizeResponse(summary=final_response)
    except Exception as e:
        print(f"Summarization failed: {e}")
        # Graceful fallback instead of hard failing
        fallback = fallback_summary(request.comments)
        return SummarizeResponse(summary=f"{fallback}\n\nBias: Bias analysis unavailable (Gemma offline).")

@app.get("/health")
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
