-- Migration 003: Add cancellation_reason column to orders
-- Run this in your Supabase SQL Editor

alter table orders add column if not exists cancellation_reason text;
