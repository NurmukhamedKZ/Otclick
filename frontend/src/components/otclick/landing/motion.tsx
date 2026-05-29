"use client";

import {
  animate,
  motion,
  useInView,
  useReducedMotion,
  type Variants,
} from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ============ Reveal — fade-up on scroll ============ */
export function Reveal({
  children,
  delay = 0,
  y = 26,
  style,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  style?: CSSProperties;
  className?: string;
  as?: "div" | "section" | "h1" | "h2" | "p" | "span";
}) {
  const reduce = useReducedMotion();
  const M = motion[as];
  return (
    <M
      className={className}
      style={style}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </M>
  );
}

/* ============ Stagger group + item ============ */
const groupV: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const itemV: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

export function StaggerGroup({
  children,
  style,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={style}
      variants={reduce ? undefined : groupV}
      initial={reduce ? false : "hidden"}
      whileInView={reduce ? undefined : "show"}
      viewport={{ once: true, margin: "-60px" }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  style,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} style={style} variants={reduce ? undefined : itemV}>
      {children}
    </motion.div>
  );
}

/* ============ Lift — spring hover ============ */
export function Lift({
  children,
  style,
  className,
  amount = 6,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  amount?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={style}
      whileHover={reduce ? undefined : { y: -amount, scale: 1.015 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
    >
      {children}
    </motion.div>
  );
}

/* ============ Float — gentle infinite drift ============ */
export function Float({
  children,
  style,
  className,
  range = 8,
  duration = 4,
  delay = 0,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  range?: number;
  duration?: number;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={style}
      animate={reduce ? undefined : { y: [0, -range, 0] }}
      transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}

/* ============ CountUp ============ */
export function CountUp({
  to,
  suffix = "",
  duration = 1.8,
  style,
  className,
}: {
  to: number;
  suffix?: string;
  duration?: number;
  style?: CSSProperties;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [val, setVal] = useState(reduce ? to : 0);

  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, to, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setVal(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, to, duration, reduce]);

  return (
    <span ref={ref} className={className} style={style}>
      {val.toLocaleString("ru-RU")}
      {suffix}
    </span>
  );
}
