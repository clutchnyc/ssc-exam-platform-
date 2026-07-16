-- Fix mojibake from the first paste: wipe attempts + questions and
-- re-insert the seed questions with correct UTF-8 text.
-- (Your in-progress practice attempt is deleted — just start it again.)

delete from certificates;
delete from attempts;
delete from questions;

with q(prompt, options, correct_option, explanation) as (
  values
    ('What is the primary ingredient used to make sake?',
     '["Barley","Rice","Wheat","Sorghum"]'::jsonb, 1,
     'Sake is brewed from polished rice, along with water, koji, and yeast.'),
    ('What does ''seimaibuai'' (精米歩合) refer to?',
     '["Fermentation temperature","The rice polishing ratio","Alcohol by volume","Aging duration"]'::jsonb, 1,
     'Seimaibuai is the percentage of the rice grain remaining after polishing — 60% means 40% has been milled away.'),
    ('Junmai Daiginjo requires rice polished to at most what percentage remaining?',
     '["70%","60%","50%","40%"]'::jsonb, 2,
     'Daiginjo classifications require a seimaibuai of 50% or less.'),
    ('What is the role of koji (麹) in sake brewing?',
     '["Adds carbonation","Converts rice starch into fermentable sugar","Filters the moromi","Raises acidity for preservation"]'::jsonb, 1,
     'Koji mold (Aspergillus oryzae) produces enzymes that break rice starch into sugars the yeast can ferment.'),
    ('Which term describes sake that has NOT been pasteurized?',
     '["Genshu","Nigori","Namazake","Koshu"]'::jsonb, 2,
     'Namazake (生酒) is unpasteurized sake, prized for fresh, lively character — and it requires refrigeration.'),
    ('''Genshu'' (原酒) indicates a sake that is…',
     '["Undiluted with water","Cloudy and unfiltered","Aged over three years","Brewed with wild yeast"]'::jsonb, 0,
     'Genshu skips the customary dilution step, typically landing at 18–20% ABV.'),
    ('The Nada brewing district, famous for its ''miyamizu'' water, is located near which city?',
     '["Niigata","Kyoto","Kobe","Hiroshima"]'::jsonb, 2,
     'Nada, in Hyogo Prefecture near Kobe, is Japan''s largest sake-producing region, known for hard miyamizu water.'),
    ('Which rice variety is often called the ''king of sake rice''?',
     '["Koshihikari","Yamada Nishiki","Gohyakumangoku","Omachi"]'::jsonb, 1,
     'Yamada Nishiki, first grown in Hyogo, is the most celebrated shuzo-kotekimai (sake-specific rice).'),
    ('A ''nihonshu-do'' (SMV) of +10 generally indicates a sake that is…',
     '["Very sweet","Very dry","Highly acidic","Low in alcohol"]'::jsonb, 1,
     'Sake Meter Value measures density; higher positive numbers indicate a drier sake.'),
    ('What is ''moromi'' (醪)?',
     '["The main fermentation mash","Pressed sake lees","A wooden brewing vat","The rice-washing stage"]'::jsonb, 0,
     'Moromi is the main mash where rice, koji, water, and yeast ferment together over several weeks.'),
    ('Which serving vessel is the small ceramic flask traditionally used to serve warmed sake?',
     '["Ochoko","Masu","Tokkuri","Guinomi"]'::jsonb, 2,
     'The tokkuri is the flask; ochoko and guinomi are cups; a masu is the square cedar box.'),
    ('Futsushu (普通酒) refers to…',
     '["Premium designation sake","Ordinary table sake without a special designation","Sparkling sake","Sake brewed only in winter"]'::jsonb, 1,
     'Futsushu is non-premium ''ordinary'' sake, making up the majority of sake produced in Japan.')
)
insert into questions (exam_id, prompt, options, correct_option, explanation)
select e.id, q.prompt, q.options, q.correct_option, q.explanation
from q cross join exams e;
