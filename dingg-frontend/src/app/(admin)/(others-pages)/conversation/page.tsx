import { Metadata } from "next";
import React from "react";
import ChatLayout from "@/components/conversation/ChatLayout";

export const metadata: Metadata = {
  title: "Conversation | Dingg Chat",
  description: "Realtime chat interface for Dingg App",
};

export default function ConversationPage() {
  return (
    <div className="h-full">
      <ChatLayout />
    </div>
  );
}
