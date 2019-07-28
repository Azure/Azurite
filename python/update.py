# coding: UTF-8
__author__ = 'xiaonli'

import MySQLdb
import time

host = '127.0.0.1'
user = 'root'
passwd = 'my-secret-pw'
db = 'azurite_blob_metadata'
port = 3306

conn = MySQLdb.connect(host, user, passwd, db, port)
conn.autocommit = False
cur = conn.cursor()

# Insert 10000 rows
count = 10000

# start_time = time.time()
# for x in xrange(count):
#     print x
#     sql = "INSERT INTO `azurite_blob_metadata`.`Tests` (`blobName`, `blockList`) VALUES ('%s', 'list%s')" % (
#         x, x)
#     cur.execute(sql)
#     conn.commit()
# end_time = time.time()
# print 'Time', (end_time - start_time) * 1000, 'ms'

# Update 10000 rows, single row commit, 1 db connection, 141078ms
# Update 10000 rows, total one commit, 1 db connection, 62808ms

start_time = time.time()
for x in xrange(count):
    # print x
    sql = "UPDATE Tests SET blockList=%s where blobName=%s" % (x+2, x)
    cur.execute(sql)
conn.commit()
cur.close()
conn.close()

end_time = time.time()
print 'Time', (end_time - start_time) * 1000, 'ms'
