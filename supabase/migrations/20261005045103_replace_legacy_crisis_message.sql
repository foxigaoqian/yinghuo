begin;

update public.messages
set text = '听到你这么说，我很担心你现在的安全。你现在是否正处于立即危险中？请先远离可能伤害到自己的物品，不要独处，马上联系一位你信任的人陪着你。如果你可能马上伤害自己，请立即拨打 110 或 120；也可以拨打全国统一心理援助热线 12356。先只回答我：你现在安全吗？'
where role = 'assistant'
  and text like '%400-161-9995%';

commit;
