import {
  MessageSquare,
  HelpCircle,
  Ghost,
  BookOpen,
  ArrowLeftRight,
  Split,
  Brain,
  Puzzle,
  Eye,
  Lightbulb,
  ListOrdered,
  Flame,
  Heart,
  Languages,
  Clock,
  Atom
} from "lucide-react";
import type { ContentType } from "@shared/schema";

const iconMap: Record<ContentType, React.ComponentType<{ className?: string }>> = {
  reddit_story: MessageSquare,
  aita_story: HelpCircle,
  two_sentence_horror: Ghost,
  short_story_generic: BookOpen,
  would_you_rather: ArrowLeftRight,
  this_or_that: Split,
  quiz_trivia: Brain,
  riddles: Puzzle,
  guessing_game: Eye,
  facts: Lightbulb,
  top_list: ListOrdered,
  motivation: Flame,
  affirmations: Heart,
  language_mini_lesson: Languages,
  mini_history: Clock,
  science_mini_fact: Atom
};

interface ContentTypeIconProps {
  contentType: ContentType;
  className?: string;
}

export function ContentTypeIcon({ contentType, className = "w-4 h-4" }: ContentTypeIconProps) {
  const Icon = iconMap[contentType] || MessageSquare;
  return <Icon className={className} />;
}
